import { useEffect } from "react";
import { usePageLoading } from "@/components/providers/page-loading-provider";

export function usePageLoaded() {
  const { stopLoading } = usePageLoading();

  useEffect(() => {
    stopLoading();
  }, [stopLoading]);
}

