"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, decodeEventLog } from "viem";
import { useRelayerSdk } from "@/components/providers/relayer-provider";
import { useNotification } from "@/components/providers/notification-provider";
import { encryptText, generateAESKeyHex, encryptBytesAESGCM, generateIv, bytesToHex } from "@/lib/encryption";
import { usePinata } from "@/hooks/use-pinata";
import { createPostMetadata } from "@/lib/pinata";
import confidentialClubAbi from "@/lib/confidential-club-abi.json";

const CONFIDENTIAL_CLUB_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_CLUB_ADDRESS || "";
//

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
}

//

//

interface TextSegment {
  type: "text" | "encrypted";
  content: string;
  id?: string;
}

//

export function CreatePostModal({ isOpen, onClose }: CreatePostModalProps) {
  const [segments, setSegments] = useState<TextSegment[]>([{ type: "text", content: "" }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [processSteps, setProcessSteps] = useState<string[]>([
    "Preparing to publish",
  ]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  // Unified notification using NotificationProvider
  const [isSelectingEncrypt, setIsSelectingEncrypt] = useState(false);
  const [price, setPrice] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<Array<{ id: string; file: File; url: string; selected: boolean }>>([]);
  const [showImages, setShowImages] = useState(false);
  const pendingDataRef = useRef<{ ipfsHash: string; postId: number | null } | null>(null);
  const { address } = useAccount();
  const { sdk: relayerSdk, instance: relayerInstance, instanceLoading, instanceError } = useRelayerSdk();
  const { uploadDirectory } = usePinata();
  const { writeContract, data: hash, isPending: isConfirming, error: writeError } = useWriteContract();
  const { data: receipt, isLoading: isWaiting, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { notice, success, error: notifyError } = useNotification();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSegments([{ type: "text", content: "" }]);
      setIsSelectingEncrypt(false);
      setPrice("");
      setImages([]);
      setShowImages(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isSubmitting) {
      setShowOverlay(true);
    }
  }, [isSubmitting]);
  
  const initSteps = (textCount: number, imageCount: number) => {
    const steps: string[] = [
      "Generate AES key",
    ];
    if (textCount > 0) steps.push(`Encrypt text (total ${textCount} segments)`);
    if (imageCount > 0) steps.push(`Encrypt images (total ${imageCount} items)`);
    steps.push("Upload to IPFS");
    steps.push("FHE-encrypt AES key");
    steps.push("Submit transaction");
    steps.push("Publish completed");
    setProcessSteps(steps);
    setCurrentStepIndex(0);
  };
  
  const markStep = (matcher: (s: string) => boolean, replaceWith?: string) => {
    setProcessSteps((prev) => {
      const idx = prev.findIndex(matcher);
      if (idx === -1) return prev;
      const next = [...prev];
      if (replaceWith) next[idx] = replaceWith;
      setCurrentStepIndex(idx);
      return next;
    });
  };

  useEffect(() => {
    if (writeError) {
      setIsSubmitting(false);
      notifyError(`Contract call failed: ${writeError.message}`);
    }
  }, [writeError, notifyError]);

  useEffect(() => {
    if (isSuccess && receipt && pendingDataRef.current) {
      const handleSuccess = async () => {
        try {
          let postId: bigint | null = null;

          for (const log of receipt.logs) {
            if (!log.topics || log.topics.length === 0) continue;
            try {
              const logData = (log as { data?: string }).data;
              const logTopics = [...(log.topics || [])] as [`0x${string}`, ...`0x${string}`[]];
              
              if (!logData || !logTopics || logTopics.length === 0) continue;
              
              const decoded = decodeEventLog({
                abi: confidentialClubAbi,
                data: logData as `0x${string}`,
                topics: logTopics,
              });
              if (decoded.eventName === "PostPublished" && decoded.args) {
                const args = decoded.args as unknown as { postId: bigint; price: bigint; ipfsHash: string };
                postId = args.postId;
                console.log(`[CreatePost] Post published successfully, postId: ${postId}, ipfsHash: ${args.ipfsHash}`);
                break;
              }
            } catch {
              continue;
            }
          }

          if (!postId) {
            throw new Error("Could not extract postId from transaction receipt");
          }

          if (pendingDataRef.current) {
            pendingDataRef.current.postId = Number(postId);
          }
          pendingDataRef.current = null;
          setIsSubmitting(false);
          success("Post published successfully");
          setSegments([{ type: "text", content: "" }]);
          setPrice("");
          if (editorRef.current) {
            editorRef.current.textContent = "";
          }
          
          window.dispatchEvent(new CustomEvent("postPublished"));
          
          setTimeout(() => {
            onClose();
          }, 2000);
        } catch (error) {
          console.error("Failed to process transaction receipt:", error);
          setIsSubmitting(false);
          const errorMsg = error instanceof Error ? error.message : String(error);
          notifyError(`Post-processing failed: ${errorMsg}`);
        }
      };

      handleSuccess();
    }
  }, [isSuccess, receipt, onClose, success, notifyError]);

  useEffect(() => {
    if (!isOpen) return;
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    
    const handleInput = () => {
      if (!currentEditor) return;
      
      const newSegments: TextSegment[] = [];
      const walker = document.createTreeWalker(
        currentEditor,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const parent = node.parentElement;
              if (parent && parent.tagName === "BUTTON") {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName === "BUTTON") {
                return NodeFilter.FILTER_REJECT;
              }
              if (element.classList.contains("encrypted-box")) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          if (text.length > 0) {
            const lastSegment = newSegments[newSegments.length - 1];
            if (lastSegment && lastSegment.type === "text") {
              lastSegment.content += text;
            } else {
          newSegments.push({
            type: "text",
                content: text,
              });
            }
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (element.classList.contains("encrypted-box")) {
            const input = element.querySelector("input") as HTMLInputElement;
            const encryptedText = input?.value || "";
            const boxId = element.getAttribute("data-encrypted-id");
            
            if (encryptedText) {
        newSegments.push({
          type: "encrypted",
          content: encryptedText,
          id: boxId || undefined,
        });
            }
          }
        }
      }
      
      console.log(`[CreatePost] handleInput extracted segments (before filter):`, newSegments.map(s => ({
        type: s.type,
        contentLength: s.content?.length || 0,
        contentPreview: s.type === "text" ? JSON.stringify(s.content?.substring(0, 50)) : "[encrypted]"
      })));
      
      const filteredSegments = newSegments.filter(s => {
        if (s.type === "text") {
          return s.content && s.content.length > 0;
        }
        return s.content && s.content.length > 0;
      });
      
      console.log(`[CreatePost] handleInput extracted segments (after filter):`, filteredSegments.map(s => ({
        type: s.type,
        contentLength: s.content?.length || 0,
        contentPreview: s.type === "text" ? JSON.stringify(s.content?.substring(0, 50)) : "[encrypted]"
      })));
      
      setSegments(filteredSegments.length > 0 ? filteredSegments : [{ type: "text", content: "" }]);
    };
    
    currentEditor.addEventListener("input", handleInput);
    return () => {
      currentEditor.removeEventListener("input", handleInput);
    };
  }, [isOpen]);

  const getPlainText = () => {
    return segments.map((s) => s.content).join("");
  };

  const getContentLength = () => {
    return getPlainText().length;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clipboardData = e.clipboardData;
    const pastedText = clipboardData.getData("text/plain");
    
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      editorRef.current.textContent = (editorRef.current.textContent || "") + pastedText;
      return;
    }
    
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(pastedText);
    range.insertNode(textNode);
    
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const updateSegmentsFromDom = () => {
    if (!editorRef.current) return;
    const parsedSegments: TextSegment[] = [];
    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const parent = (node as Node).parentElement;
            if (parent && parent.tagName === "BUTTON") return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.tagName === "BUTTON") return NodeFilter.FILTER_REJECT;
            if (element.classList.contains("encrypted-box")) return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      }
    );
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = n.textContent || "";
        if (t.length > 0) {
          const last = parsedSegments[parsedSegments.length - 1];
          if (last && last.type === "text") last.content += t; else parsedSegments.push({ type: "text", content: t });
        }
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        if (el.classList.contains("encrypted-box")) {
          const inputEl = el.querySelector("input") as HTMLInputElement | null;
          const v = inputEl?.value || "";
          const boxId = el.getAttribute("data-encrypted-id") || undefined;
          if (v) parsedSegments.push({ type: "encrypted", content: v, id: boxId });
        }
      }
    }
    const filtered = parsedSegments.filter((s) => s.content && s.content.length > 0);
    setSegments(filtered.length > 0 ? filtered : [{ type: "text", content: "" }]);
  };

  const handlePickImages = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setImages(prev => {
      const remaining = Math.max(0, 4 - prev.length);
      const picked = files.slice(0, remaining).map((file) => ({ id: `${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file), selected: false }));
      return [...prev, ...picked];
    });
    e.target.value = "";
  };

  const handleRemoveImage = (id: string) => {
    setImages(prev => {
      const item = prev.find(x => x.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter(x => x.id !== id);
    });
  };

  const handleSelectEncrypt = () => {
    setIsSelectingEncrypt((v) => !v);
  };

  const toggleSelectImage = (id: string) => {
    setImages((prev) => prev.map((img) => {
      if (img.id !== id) return img;
      if (isSelectingEncrypt) {
        return { ...img, selected: !img.selected };
      }
      if (!isSelectingEncrypt && img.selected) {
        return { ...img, selected: false };
      }
      return img;
    }));
  };

  const handleMouseUp = () => {
    if (!isSelectingEncrypt || !editorRef.current) return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      if (range.collapsed) {
        return;
      }

      const startContainer = range.startContainer;
      const endContainer = range.endContainer;

      if (!editorRef.current?.contains(startContainer) || !editorRef.current?.contains(endContainer)) {
        return;
      }

      // If a boundary lies inside an encrypted block, expand the range to cover the whole block to avoid partial selection
      const findEncryptedAncestor = (node: Node | null): Element | null => {
        let el: Node | null = node;
        while (el && el !== editorRef.current) {
          if (el instanceof Element && el.classList.contains("encrypted-box")) return el;
          el = el.parentNode;
        }
        return null;
      };

      const startBox = findEncryptedAncestor(range.startContainer);
      if (startBox) {
        range.setStartBefore(startBox);
      }
      const endBox = findEncryptedAncestor(range.endContainer);
      if (endBox) {
        range.setEndAfter(endBox);
      }

      // Extract plain text from the selected fragment: normal text uses its value; encrypted blocks use input.value
      const fragment = range.cloneContents();
      const textParts: string[] = [];
      const fragmentWalker = document.createTreeWalker(
        fragment,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName === "BUTTON") return NodeFilter.FILTER_REJECT;
              if (element.classList.contains("encrypted-box")) return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );

      let fNode: Node | null;
      while ((fNode = fragmentWalker.nextNode())) {
        if (fNode.nodeType === Node.TEXT_NODE) {
          const t = fNode.textContent || "";
          if (t) textParts.push(t);
        } else if (fNode.nodeType === Node.ELEMENT_NODE) {
          const el = fNode as Element;
          if (el.classList.contains("encrypted-box")) {
            const inputEl = el.querySelector("input") as HTMLInputElement | null;
            const v = inputEl?.value || "";
            if (v) textParts.push(v);
          }
        }
      }
      const selectedText = textParts.join("");
      if (!selectedText.trim()) {
        return;
      }

      // Prevent selections that overlap with existing encrypted blocks
      const boxes = editorRef.current.querySelectorAll('.encrypted-box');
      const intersects = (r: Range, el: Element) => {
        const elRange = document.createRange();
        elRange.selectNode(el);
        const endsBefore = r.compareBoundaryPoints(Range.END_TO_START, elRange) <= 0;
        const startsAfter = r.compareBoundaryPoints(Range.START_TO_END, elRange) >= 0;
        return !(endsBefore || startsAfter);
      };
      for (const el of Array.from(boxes)) {
        if (intersects(range, el)) {
          notice("Selection overlaps with an existing encrypted segment; please adjust your selection.");
          selection.removeAllRanges();
          return;
        }
      }

      const encryptedId = `encrypted-${Date.now()}-${Math.random()}`;
      const encryptedBox = document.createElement("span");
      encryptedBox.className = "encrypted-box inline-flex items-center relative bg-yellow-400/90 dark:bg-yellow-500/80 rounded py-0.5 mx-0.5 my-0.5 text-zinc-900 dark:text-zinc-900";
      encryptedBox.setAttribute("contenteditable", "false");
      encryptedBox.setAttribute("data-encrypted-id", encryptedId);
      
      const input = document.createElement("input");
      input.type = "text";
      input.value = selectedText;
      input.className = "bg-transparent border-none outline-none text-sm text-zinc-900 dark:text-zinc-900 px-1";
      
      const calculateWidth = (text: string) => {
        if (!editorRef.current) {
          return Math.max(text.length * 7 + 8, 28);
        }
        
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          return Math.max(text.length * 7 + 8, 28);
        }
        
        const computedStyle = window.getComputedStyle(editorRef.current);
        context.font = `${computedStyle.fontSize} ${computedStyle.fontFamily}`;
        const metrics = context.measureText(text || " ");
        return Math.max(metrics.width + 8, 28);
      };
      
      input.style.width = `${calculateWidth(selectedText)}px`;
      input.style.minWidth = "28px";
      
      const updateWidth = () => {
        input.style.width = `${calculateWidth(input.value)}px`;
      };
      
      input.addEventListener("input", updateWidth);
      input.addEventListener("keyup", updateWidth);
      input.addEventListener("paste", () => {
        setTimeout(updateWidth, 0);
      });
      
      const deleteBtn = document.createElement("button");
      deleteBtn.innerHTML = "×";
      deleteBtn.className = "absolute top-0 right-0 h-3 w-3 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center hover:bg-red-600 transition leading-none";
      deleteBtn.style.fontSize = "10px";
      deleteBtn.style.lineHeight = "1";
      deleteBtn.style.transform = "translate(30%, -30%)";
      deleteBtn.style.userSelect = "none";
      deleteBtn.setAttribute("contenteditable", "false");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const textNode = document.createTextNode(input.value);
        encryptedBox.parentNode?.replaceChild(textNode, encryptedBox);
        updateSegmentsFromDom();
      });
      
      encryptedBox.appendChild(input);
      encryptedBox.appendChild(deleteBtn);
      
      range.deleteContents();
      range.insertNode(encryptedBox);
      
      // Re-parse from the DOM to avoid losing encryption statistics across multiple segments
      const parsedSegments: TextSegment[] = [];
      const walker2 = document.createTreeWalker(
        editorRef.current!,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const parent = node.parentElement;
              if (parent && parent.tagName === "BUTTON") return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName === "BUTTON") return NodeFilter.FILTER_REJECT;
              if (element.classList.contains("encrypted-box")) return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );
      let n2: Node | null;
      while ((n2 = walker2.nextNode())) {
        if (n2.nodeType === Node.TEXT_NODE) {
          const t = n2.textContent || "";
          if (t.length > 0) {
            const last = parsedSegments[parsedSegments.length - 1];
            if (last && last.type === "text") last.content += t; else parsedSegments.push({ type: "text", content: t });
          }
        } else if (n2.nodeType === Node.ELEMENT_NODE) {
          const el = n2 as Element;
          if (el.classList.contains("encrypted-box")) {
            const inputEl = el.querySelector("input") as HTMLInputElement | null;
            const v = inputEl?.value || "";
            const boxId = el.getAttribute("data-encrypted-id") || undefined;
            if (v) parsedSegments.push({ type: "encrypted", content: v, id: boxId });
          }
        }
      }
      const filtered = parsedSegments.filter((s) => s.content && s.content.length > 0);
      setSegments(filtered.length > 0 ? filtered : [{ type: "text", content: "" }]);
      selection.removeAllRanges();
    }, 0);
  };

  const handleSubmit = async () => {
    const plainText = getPlainText();
    if (!plainText.trim() && images.length === 0) {
      notice("Select text or images to encrypt before publishing.");
      return;
    }

    const encryptedSegments = segments.filter((s) => s.type === "encrypted");
    const selectedImages = images.filter((i) => i.selected);
    if (encryptedSegments.length === 0 && selectedImages.length === 0) {
      notice("Select text or images to encrypt before publishing.");
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      notice("Please enter a valid price.");
      return;
    }

    if (!relayerSdk) {
      notifyError("Relayer SDK is not loaded. Please try again later.");
      return;
    }

    if (!address) {
      notice("Please connect an Ethereum-compatible wallet first.");
      return;
    }

    if (!relayerInstance) {
      if (instanceLoading) {
        notice("Relayer instance is being created, please try again later.");
        return;
      }
      if (instanceError) {
        notifyError(`Relayer instance is unavailable: ${instanceError.message}`);
        return;
      }
      notice("Relayer instance is not ready yet. Please try again later.");
      return;
    }

    if (!CONFIDENTIAL_CLUB_ADDRESS) {
      notifyError("Contract address is not configured.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!editorRef.current) {
        throw new Error("Editor is not ready");
      }

      // Parse final segments from the DOM first so that steps can be initialized correctly
      const finalSegments: TextSegment[] = [];
      const walker = document.createTreeWalker(
        editorRef.current,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const parent = node.parentElement;
              if (parent && parent.tagName === "BUTTON") {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName === "BUTTON") {
                return NodeFilter.FILTER_REJECT;
              }
              if (element.classList.contains("encrypted-box")) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          if (text.length > 0) {
            const lastSegment = finalSegments[finalSegments.length - 1];
            if (lastSegment && lastSegment.type === "text") {
              lastSegment.content += text;
            } else {
              finalSegments.push({
                type: "text",
                content: text,
              });
            }
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (element.classList.contains("encrypted-box")) {
            const input = element.querySelector("input") as HTMLInputElement;
            const encryptedText = input?.value || "";
            const boxId = element.getAttribute("data-encrypted-id");
            
            if (encryptedText) {
              finalSegments.push({
                type: "encrypted",
                content: encryptedText,
                id: boxId || undefined,
              });
            }
          }
        }
      }

      const filteredFinalSegments = finalSegments.filter(s => {
        if (s.type === "text") {
          return s.content && s.content.length > 0;
        }
        return s.content && s.content.length > 0;
      });

      console.log(`[CreatePost] handleSubmit extracted segments from DOM:`, filteredFinalSegments.map(s => ({
        type: s.type,
        contentLength: s.content?.length || 0,
        contentPreview: s.type === "text" ? JSON.stringify(s.content?.substring(0, 50)) : "[encrypted]"
      })));

      const hasEncryptedSegments = filteredFinalSegments.some((s) => s.type === "encrypted");
      
      if (!hasEncryptedSegments) {
        throw new Error("No encrypted content found");
      }

      // Initialize progress steps
      const totalTextToEncrypt = filteredFinalSegments.filter(s => s.type === "encrypted").length;
      const totalImagesToEncrypt = images.filter(i => i.selected).length;
      initSteps(totalTextToEncrypt, totalImagesToEncrypt);
      
      console.log("[CreatePost] ========== Step 1: Generate AES key ==========");
      setCurrentStepIndex(0);
        const aesKeyHex = generateAESKeyHex();
        const aesKeyNumber = BigInt("0x" + aesKeyHex);
      console.log(`[CreatePost] AES key generated: ${aesKeyHex.substring(0, 16)}...`);

        if (aesKeyNumber === BigInt(0)) {
          throw new Error("AES key conversion failed");
        }

      console.log("[CreatePost] ========== Step 2: AES-encrypt selected content segments ==========");
      if (totalTextToEncrypt > 0) {
        markStep((s) => s.startsWith("Encrypt text"), `Encrypt text (${totalTextToEncrypt} segments) 0/${totalTextToEncrypt}`);
      }
      const plainTextSegments: Array<{ index: number; content: string; start: number }> = [];
      const encryptedSegments: string[] = [];
      const segments: Array<{
        index: number;
        type: "text" | "encrypted";
        start: number;
        length: number;
        plainTextIndex?: number;
        encryptedIndex?: number;
      }> = [];

      let currentPosition = 0;
      let plainTextIndex = 0;
      let encryptedIndex = 0;

      filteredFinalSegments.forEach((segment: TextSegment, index: number) => {
        if (segment.type === "encrypted") {
          if (!segment.content) {
            console.warn(`[CreatePost] Skipping empty encrypted segment ${index}`);
            return;
          }
          console.log(`[CreatePost] AES-encrypting segment ${index}, content length: ${segment.content.length}`);
          const encryptedContent = encryptText(segment.content, aesKeyHex);
          console.log(`[CreatePost] Segment ${index} AES-encrypted, ciphertext length: ${encryptedContent.length}`);
          
          encryptedSegments.push(encryptedContent);
          segments.push({
            index: segments.length,
            type: "encrypted",
            start: currentPosition,
            length: segment.content.length,
            encryptedIndex: encryptedIndex,
          });
          currentPosition += segment.content.length;
          encryptedIndex++;
          if (totalTextToEncrypt > 0) {
            const done = encryptedIndex;
            markStep((s) => s.startsWith("Encrypt text"), `Encrypt text (${totalTextToEncrypt} segments) ${done}/${totalTextToEncrypt}`);
          }
        } else {
          if (!segment.content) {
            console.warn(`[CreatePost] Skipping empty plaintext segment ${index}`);
            return;
          }
          console.log(`[CreatePost] Segment ${index} is plaintext, storing directly, length: ${segment.content.length}`);
          
          plainTextSegments.push({
            index: plainTextIndex,
            content: segment.content,
            start: currentPosition,
          });
          segments.push({
            index: segments.length,
            type: "text",
            start: currentPosition,
            length: segment.content.length,
            plainTextIndex: plainTextIndex,
          });
          currentPosition += segment.content.length;
          plainTextIndex++;
        }
      });

      console.log("[CreatePost] ========== AES encryption completed ==========");
      console.log(`[CreatePost] Total segments: ${segments.length}`);
      console.log(`[CreatePost] Plaintext segments: ${plainTextSegments.length}`);
      console.log(`[CreatePost] Encrypted segments: ${encryptedSegments.length}`);

      console.log("[CreatePost] ========== Step 3: Prepare IPFS directory upload ==========");
      if (totalImagesToEncrypt > 0) {
        markStep((s) => s.startsWith("Encrypt images"), `Encrypt images (${totalImagesToEncrypt} images) 0/${totalImagesToEncrypt}`);
      }
      
      const imagesManifest: Array<{ path: string; iv: string | null; mime: string; name: string; size: number; encrypted: boolean }> = [];
      const filesToUpload: Array<{ path: string; blob: Blob }> = [];
      
      for (let i = 0; i < images.length; i += 1) {
        const img = images[i];
        if (img.selected) {
          const arrayBuf = await img.file.arrayBuffer();
          const iv = generateIv(12);
          const cipher = await encryptBytesAESGCM(arrayBuf, aesKeyHex, iv);
          const relPath = `images_encrypted/${i + 1}-${img.file.name}.enc`;
          const cipherBuf = (cipher.buffer.slice(cipher.byteOffset, cipher.byteOffset + cipher.byteLength) as ArrayBuffer);
          filesToUpload.push({ path: relPath, blob: new Blob([cipherBuf], { type: "application/octet-stream" }) });
          imagesManifest.push({ path: relPath, iv: bytesToHex(iv), mime: img.file.type, name: img.file.name, size: img.file.size, encrypted: true });
          // Update encrypted image progress
          const done = imagesManifest.filter((x) => x.encrypted).length;
          if (totalImagesToEncrypt > 0) {
            markStep((s) => s.startsWith("Encrypt images"), `Encrypt images (${totalImagesToEncrypt} images) ${done}/${totalImagesToEncrypt}`);
          }
        } else {
          const relPath = `images_public/${i + 1}-${img.file.name}`;
          filesToUpload.push({ path: relPath, blob: img.file });
          imagesManifest.push({ path: relPath, iv: null, mime: img.file.type, name: img.file.name, size: img.file.size, encrypted: false });
        }
      }

      const postData = {
        plainTextSegments,
        encryptedSegments,
        segments,
        images: imagesManifest,
        version: "1.0",
      };

      const contentBlob = new Blob([JSON.stringify(postData)], { type: "application/json" });
      filesToUpload.push({ path: "content.json", blob: contentBlob });

      markStep((s) => s === "Upload to IPFS");
      const metadata = createPostMetadata("temp", address!, { fileType: "content", timestamp: Date.now() });
      const ipfsHash = await uploadDirectory(filesToUpload, metadata);
      console.log(`[CreatePost] Directory upload completed, CID: ${ipfsHash}`);

      console.log("[CreatePost] ========== Step 5: FHE-encrypt AES key ==========");
      markStep((s) => s === "FHE-encrypt AES key");
      console.log(`[CreatePost] Preparing to FHE-encrypt AES key: ${aesKeyHex.substring(0, 16)}...`);
      const input = relayerInstance.createEncryptedInput(CONFIDENTIAL_CLUB_ADDRESS, address);
      const fhevmEncryption = await input.add256(aesKeyNumber).encrypt();
      console.log("[CreatePost] FHE encryption completed");
      
      const handle = fhevmEncryption.handles[0];
      const proof = fhevmEncryption.inputProof;
      
      const isUint8Array = (val: unknown): val is Uint8Array => val instanceof Uint8Array;
      
      const encryptedKeyHex = isUint8Array(handle)
        ? Array.from(handle).map((b) => b.toString(16).padStart(2, "0")).join("")
        : String(handle);
      const proofHex = isUint8Array(proof)
        ? Array.from(proof).map((b) => b.toString(16).padStart(2, "0")).join("")
        : String(proof);
      
      const encryptedKey = encryptedKeyHex.startsWith("0x") ? encryptedKeyHex : `0x${encryptedKeyHex}`;
      const inputProof = proofHex.startsWith("0x") ? proofHex : `0x${proofHex}`;
      console.log(`[CreatePost] FHE-encrypted key handle length: ${encryptedKey.length}`);
      console.log(`[CreatePost] FHE-encrypted proof length: ${inputProof.length}`);

      console.log("[CreatePost] ========== Step 6: Call contract ==========");
      markStep((s) => s === "Submit transaction");
      console.log(`[CreatePost] Preparing to call publishPost:`);
      console.log(`[CreatePost]   - IPFS hash: ${ipfsHash}`);
      console.log(`[CreatePost]   - Price: ${price} ETH`);
      console.log(`[CreatePost]   - FHE-encrypted key: ${encryptedKey.substring(0, 20)}...`);

      pendingDataRef.current = {
        ipfsHash,
        postId: null,
      };

      writeContract({
        address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
        abi: confidentialClubAbi,
        functionName: "publishPost",
        args: [
          ipfsHash,
          parseEther(price),
          encryptedKey as `0x${string}`,
          inputProof as `0x${string}`,
        ],
      });

      notice("Transaction submitted, waiting for confirmation...");
      // The receipt will be handled in the effect above; here we just set the current step to "Submit transaction"
    } catch (error) {
      console.error("Post creation failed:", error);
      
      // Detect specific error categories
      let errorMessage = "Post creation failed";
      if (error instanceof Error) {
        if (error.message.includes("backend connection task has stopped") || 
            error.message.includes("Relayer didn't response correctly")) {
          errorMessage = "Relayer encryption service is temporarily unavailable. Please try again later.";
        } else if (error.message.includes("fetch failed")) {
          errorMessage = "Content upload failed. Please refresh the page and try again.";
        } else if (error.message.includes("Pinata") || 
                   error.message.toLowerCase().includes("upload")) {
          errorMessage = "Content upload failed. Please try again later.";
        } else if (error.message.includes("Connect Timeout") || 
                   error.message.includes("network")) {
          errorMessage = "Network connection failed. Please check your network and try again.";
        } else if (error.message.includes("user rejected")) {
          errorMessage = "Transaction was cancelled";
        } else {
          errorMessage = `Post creation failed: ${error.message}`;
        }
      } else {
        errorMessage = `Post creation failed: ${String(error)}`;
      }
      
      notifyError(errorMessage);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-lg overflow-visible"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-end gap-1">
            <div className="relative z-10 flex items-center gap-1.5 rounded-t-lg border-x-2 border-t-2 border-zinc-200/60 bg-white/95 px-4 py-2 dark:border-zinc-800/60 dark:bg-zinc-900/95">
              <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Publish new post
              </h2>
            </div>
            <button
              disabled
              className="flex items-center gap-1.5 rounded-t-lg border-x-2 border-t-2 border-b-2 border-zinc-200/60 bg-zinc-100/80 px-3 py-2 text-sm font-medium text-zinc-500 dark:border-zinc-800/60 dark:bg-zinc-800/80 dark:text-zinc-400 disabled:cursor-not-allowed"
            >
              More confidential features coming soon
            </button>
          </div>
          <div className="relative -mt-[2px] rounded-lg rounded-tl-none border border-zinc-200/60 bg-white/95 backdrop-blur-sm shadow-xl dark:border-zinc-800/60 dark:bg-zinc-900/95">
          {showOverlay && (
            <div 
              className={`absolute inset-0 z-10 flex items-start justify-center pt-24 md:pt-28 rounded-lg overlay-silver backdrop-blur-sm transition-opacity duration-300 ${
                isSubmitting ? 'opacity-100' : 'opacity-0'
              }`}
              onTransitionEnd={() => {
                if (!isSubmitting) {
                  setShowOverlay(false);
                }
              }}
            >
              <div className="flex w-full max-w-sm flex-col items-center px-4">
                <div className="relative">
                  <div className="absolute -inset-2 animate-ping rounded-full overlay-silver-ping"></div>
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-4 overlay-silver-border bg-white/5 dark:bg-black/20">
                    <svg className="h-7 w-7 animate-spin overlay-silver-text" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  </div>
                </div>
                <div className="mt-6 w-full px-2 flex flex-col gap-2">
                  {currentStepIndex > 0 && processSteps[currentStepIndex - 1] && (
                    <div className="text-center text-sm overlay-silver-text-dim transition-all duration-300">
                      ✓ {processSteps[currentStepIndex - 1]}
                    </div>
                  )}
                  <div className="text-center text-base font-semibold overlay-silver-text transition-all duration-300">
                    {processSteps[currentStepIndex]}
                  </div>
                  {currentStepIndex < processSteps.length - 1 && processSteps[currentStepIndex + 1] && (
                    <div className="text-center text-sm overlay-silver-text-dim transition-all duration-300">
                      {processSteps[currentStepIndex + 1]}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end px-4 pt-2 pb-1">
            <button
              onClick={onClose}
              className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="px-4 pb-4">
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={handleSelectEncrypt}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  isSelectingEncrypt
                    ? "bg-yellow-400 text-zinc-900 dark:bg-yellow-500 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {isSelectingEncrypt ? "Cancel selection" : "Select to encrypt"}
              </button>
              {(() => {
                const textCount = segments.filter((s) => s.type === "encrypted").length;
                const imageCount = images.filter((i) => i.selected).length;
                if (textCount > 0 || imageCount > 0) {
                  return (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Selected text segments: {textCount} · images: {imageCount}</span>
                  );
                }
                if (isSelectingEncrypt) {
                  return (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400">Select the text or images you want to encrypt</span>
                  );
                }
                return null;
              })()}
            </div>

            <div className="relative">
              <div
                ref={editorRef}
                contentEditable
                onMouseUp={handleMouseUp}
                onPaste={handlePaste}
                suppressContentEditableWarning
                className="min-h-[240px] max-h-[500px] w-full resize-y overflow-auto rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-600 transition-colors"
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
                data-placeholder="Share your thoughts..."
              />
              {(editorRef.current?.textContent?.trim() || segments.length > 0) && (
                <button
                  onClick={() => {
                    if (editorRef.current) {
                      editorRef.current.textContent = "";
                    }
                    setSegments([{ type: "text", content: "" }]);
                  }}
                  className="absolute bottom-2 right-2 rounded p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-700 dark:hover:text-red-400"
                  title="Clear content"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>

            {/* Image selection section (details/accordion) */}
            <div className="mt-3">
              <details
                className="group"
                open={showImages || images.length > 0}
                onToggle={(e) => setShowImages((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary className="list-none cursor-pointer select-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800 flex items-center justify-between">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    Images (optional){images.length > 0 ? ` · ${images.length}/4` : ""}
                  </span>
                  <svg
                    className="h-4 w-4 text-zinc-400 transition-transform duration-200 group-open:rotate-180"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </summary>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className={`relative aspect-square overflow-hidden rounded border ${img.selected ? "border-yellow-400 border-dashed ring-2 ring-yellow-300/40" : "border-zinc-200 dark:border-zinc-700"}`}
                      onClick={() => toggleSelectImage(img.id)}
                    >
                      <img src={img.url} alt="preview" className="h-full w-full object-cover" />
                      {img.selected ? (
                        <button
                          type="button"
                            onClick={(e) => {
                            e.stopPropagation();
                            setImages((prev) => prev.map((it) => it.id === img.id ? { ...it, selected: false } : it));
                          }}
                          className="absolute left-1 top-1 rounded bg-yellow-400/50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-900 shadow dark:bg-yellow-500/50 focus:outline-none"
                          aria-label="Cancel image encryption"
                        >
                          Encrypted
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(img.id)}
                        className="absolute right-1 top-1 h-5 w-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center"
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {images.length < 4 && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={handlePickImages}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handlePickImages();
                      }}
                      className="flex aspect-square items-center justify-center rounded border border-dashed border-zinc-300 text-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800"
                      aria-label="Add image"
                    >
                      +
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFilesSelected}
                />
              </details>
            </div>

            <style jsx global>{`
              [contenteditable][data-placeholder]:empty:before {
                content: attr(data-placeholder);
                color: rgb(161 161 170);
                pointer-events: none;
              }
              [contenteditable][data-placeholder]:focus:before {
                content: "";
              }
            `}</style>

            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-600 dark:text-zinc-400">Price (ETH):</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.001"
                  disabled={isSubmitting}
                  className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-600 disabled:opacity-50"
                />
              </div>
              <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {getContentLength()} / 1000
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  disabled={isSubmitting || isConfirming}
                  className="rounded-lg px-4 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                    disabled={
                      isSubmitting ||
                      isConfirming ||
                      isWaiting ||
                      ((getContentLength() === 0 && ((editorRef.current?.textContent?.trim()?.length || 0) === 0)) && images.length === 0) ||
                      !price
                    }
                  className="shimmer-button rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:filter-none"
                >
                  {isWaiting ? "Confirming..." : isConfirming ? "Submitting..." : isSubmitting ? "Publishing..." : "Publish"}
                </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Notifications are rendered centrally by NotificationProvider */}
    </>
  );
}
