import { useEffect, useState } from "react";

export function useMediaQuery(query: string): { matches: boolean; mounted: boolean } {
  const [state, setState] = useState<{ matches: boolean; mounted: boolean }>(() => ({
    matches: typeof window === "undefined" || !window.matchMedia ? false : window.matchMedia(query).matches,
    mounted: false,
  }));

  useEffect(() => {
    if (!window.matchMedia) {
      setState({ matches: false, mounted: true });
      return;
    }
    const media = window.matchMedia(query);
    const handleChange = () => setState({ matches: media.matches, mounted: true });
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return state;
}
