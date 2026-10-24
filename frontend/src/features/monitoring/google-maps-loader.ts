declare global {
  interface Window {
    __sanmouGoogleMapsPromise?: Promise<typeof google>;
  }
}

const SCRIPT_ID = "sanmou-google-maps";

export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (window.__sanmouGoogleMapsPromise) {
    return window.__sanmouGoogleMapsPromise;
  }

  window.__sanmouGoogleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");

    const handleLoad = () => {
      if (window.google?.maps) {
        resolve(window.google);
        return;
      }
      reject(new Error("Google Mapsを初期化できませんでした"));
    };

    const handleError = () =>
      reject(new Error("Google Mapsを読み込めませんでした"));
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.id = SCRIPT_ID;
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      document.head.append(script);
    }
  });

  return window.__sanmouGoogleMapsPromise;
}
