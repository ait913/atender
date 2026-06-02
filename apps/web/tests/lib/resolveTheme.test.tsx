import React, { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { initTheme, resolveTheme, useTheme } from "@/lib/useTheme";

type MatchMediaStub = {
  setMatches: (next: boolean) => void;
  fire: () => void;
  addSpy: ReturnType<typeof vi.fn>;
  removeSpy: ReturnType<typeof vi.fn>;
};

function installMatchMedia(initialMatches: boolean): MatchMediaStub {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addSpy = vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
    listeners.add(listener);
  });
  const removeSpy = vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
    listeners.delete(listener);
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: addSpy,
      removeEventListener: removeSpy,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  return {
    setMatches: (next) => {
      matches = next;
    },
    fire: () => {
      for (const listener of [...listeners]) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
    addSpy,
    removeSpy,
  };
}

function ThemeHarness() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    (window as any).__setTheme = setTheme;
  }, [setTheme]);

  return <div data-testid="theme">{theme}</div>;
}

describe("useTheme theme resolution", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => {
          store.clear();
        },
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
          return store.size;
        },
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    delete (window as any).__setTheme;
  });

  it("resolves explicit light and dark without consulting OS", () => {
    installMatchMedia(true);

    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves auto from matchMedia", () => {
    const stub = installMatchMedia(true);
    expect(resolveTheme("auto")).toBe("dark");

    stub.setMatches(false);
    expect(resolveTheme("auto")).toBe("light");
  });

  it("initializes auto from OS dark when localStorage is empty", () => {
    installMatchMedia(true);

    initTheme();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("initializes explicit light from localStorage", () => {
    installMatchMedia(true);
    window.localStorage.setItem("theme", "light");

    initTheme();

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("updates data-theme when auto follows OS changes", () => {
    const stub = installMatchMedia(true);
    render(<ThemeHarness />);

    act(() => {
      (window as any).__setTheme("auto");
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("auto");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    act(() => {
      stub.setMatches(false);
      stub.fire();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists explicit dark and ignores later OS changes", () => {
    const stub = installMatchMedia(false);
    render(<ThemeHarness />);

    act(() => {
      (window as any).__setTheme("dark");
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");

    act(() => {
      stub.setMatches(false);
      stub.fire();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("removes the auto matchMedia listener on cleanup", () => {
    const stub = installMatchMedia(false);
    const view = render(<ThemeHarness />);

    act(() => {
      (window as any).__setTheme("auto");
    });
    view.unmount();

    expect(stub.removeSpy).toHaveBeenCalled();
  });

  it("keeps data-theme set to light or dark instead of deleting it", () => {
    const stub = installMatchMedia(false);
    render(<ThemeHarness />);

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => {
      (window as any).__setTheme("auto");
      stub.setMatches(true);
      stub.fire();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(true);
  });
});
