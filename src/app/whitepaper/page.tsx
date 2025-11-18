"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { usePageLoaded } from "@/hooks/use-page-loaded";

export default function WhitepaperPage() {
  usePageLoaded();
  return (
    <AppLayout>
      <div className="px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Project Whitepaper
          </h1>
          
          <div className="rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="prose prose-zinc dark:prose-invert max-w-none">
              <h2 className="text-2xl font-semibold mb-2">Confidential Club</h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-6 italic">
                Powered by Zama FHE technology, opening a new era for encrypted on-chain paid content.
              </p>
              
              <section className="mb-8">
                <h3 className="text-xl font-semibold mb-3">Overview</h3>
                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Confidential Club is a confidential content monetization platform built on Zama FHEVM. It leverages
                  Zama&apos;s encrypted storage and access control to provide secure on-chain key management and
                  authorization, combined with off-chain encrypted content storage. The platform supports mixed text
                  and image posts, and creators can choose which text segments and images should be encrypted to
                  achieve fine-grained access control.
                </p>
              </section>

              <section className="mb-8">
                <h3 className="text-xl font-semibold mb-3">Key Features</h3>
                <ul className="space-y-2 text-zinc-700 dark:text-zinc-300">
                  <li>• Encrypted key storage and access control based on Zama FHEVM (euint256 + ACL)</li>
                  <li>• Support for mixed text and image posts</li>
                  <li>• Flexible encryption: selectively encrypt specific text segments or images</li>
                  <li>• Per-post pricing model with flexible pricing</li>
                  <li>• On-chain key management and authorization with off-chain encrypted content storage</li>
                  <li>• Decentralized per-post paid content platform</li>
                </ul>
              </section>

              <section className="mb-8">
                <h3 className="text-xl font-semibold mb-3">Architecture</h3>
                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
                  The platform adopts a hybrid encryption architecture:
                </p>
                <ul className="space-y-2 text-zinc-700 dark:text-zinc-300">
                  <li>• <strong>Smart contract layer:</strong> <code>ConfidentialClub.sol</code> manages post publishing,
                    purchases, and on-chain authorization</li>
                  <li>• <strong>Key management:</strong> Zama FHEVM stores AES keys as encrypted euint256 values and
                    enforces access control via ACL + Gateway</li>
                  <li>• <strong>Content encryption:</strong> AES-GCM symmetric encryption for off-chain text and image
                    content</li>
                  <li>• <strong>Storage layer:</strong> IPFS/Pinata decentralized storage for encrypted content</li>
                  <li>• <strong>Frontend layer:</strong> Next.js 16 (App Router) + React 19 + custom Relayer SDK integration (EIP-712 signatures +
                    <code>userDecrypt</code>) for a modern user experience</li>
                </ul>
              </section>

              <section className="mb-8">
                <h3 className="text-xl font-semibold mb-3">Pricing and Authorization Model</h3>
                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-3">
                  The platform uses a per-post payment plus FHE-based authorization model: the contract only manages the
                  price, encrypted key handle, and access rights, while the actual content is stored encrypted off-chain.
                </p>
                <ul className="space-y-2 text-zinc-700 dark:text-zinc-300">
                  <li>• When a post is published, the contract records the encrypted key handle (euint256) and price;
                    the content itself is stored on IPFS</li>
                  <li>• When a post is purchased, the user calls <code>buyPost</code> to pay; the contract calls
                    <code>FHE.allow(post.key, buyer)</code> to grant the buyer access to the encrypted key</li>
                  <li>• The frontend uses the Relayer SDK&apos;s <code>userDecrypt</code> to recover the AES key from the
                    encrypted handle and decrypt the off-chain content locally</li>
                </ul>
              </section>

              <section className="mb-8">
                <h3 className="text-xl font-semibold mb-3">Workflow</h3>
                <div className="space-y-4 text-zinc-700 dark:text-zinc-300">
                  <div>
                    <h4 className="font-semibold mb-2">Publishing content:</h4>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li>Generate a random AES key (shared by text and images within the same post)</li>
                      <li>Select text segments that should be encrypted and encrypt them with the AES key</li>
                      <li>Select images that should be encrypted and encrypt them using AES-GCM (each image uses a
                        different random IV)</li>
                      <li>Store non-encrypted images in plaintext</li>
                      <li>Package all content into a directory structure and upload it to IPFS (including
                        <code>content.json</code> and image files)</li>
                      <li>Encrypt the AES key off-chain with the FHE public key and submit it to the contract as an
                        euint256 for persistent storage</li>
                      <li>The contract calls <code>FHE.allowThis(key)</code> to grant itself access to the encrypted
                        key</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Purchasing content:</h4>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li>The user calls <code>buyPost</code> to pay for the content</li>
                      <li>The contract executes <code>FHE.allow(post.key, buyer)</code> to authorize the buyer</li>
                      <li>The frontend retrieves the plaintext AES key via Relayer SDK <code>userDecrypt</code></li>
                      <li>Download the directory content from IPFS</li>
                      <li>Use the AES key to decrypt encrypted text segments and images</li>
                      <li>Plaintext images are displayed directly; decrypted content is rendered in full</li>
                    </ol>
                  </div>
                </div>
              </section>

              <section className="mb-8">
                <h3 className="text-xl font-semibold mb-3">Security</h3>
                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-3">
                  With Zama FHEVM, content keys are stored on-chain in encrypted form (euint256) and are never exposed
                  in plaintext. The contract only stores the FHE-encrypted key handle (euint256), not the AES key
                  itself. Only authorized users, via ACL rules and the Gateway service, can decrypt the key and access
                  the off-chain encrypted content.
                </p>
                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Off-chain content is protected using AES-GCM symmetric encryption: text and images share the same AES
                  key, while each image uses an independent random IV. Knowing the IPFS address alone is not sufficient
                  to obtain the plaintext; the AES key must first be decrypted from the on-chain handle. Creators can
                  choose which parts of the content to encrypt, while non-encrypted parts are stored in plaintext as
                  public content for previews and discovery.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-3">Future Roadmap</h3>
                <ul className="space-y-2 text-zinc-700 dark:text-zinc-300">
                  <li>• Confidential voting features (planned)</li>
                  <li>• Confidential auction mechanisms (planned)</li>
                  <li>• Additional privacy-preserving application scenarios (planned)</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

