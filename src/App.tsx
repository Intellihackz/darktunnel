import { useEffect, useRef } from "react";
import { initScroll, watchFrame, watchReveals } from "./engine";
import { Frame } from "./Frame";
import { startField } from "./motion/field";
import { AppPage } from "./app/AppPage";
import { File, Footer, Ghost, Hero, NotFound, Ways } from "./sections";

export function App({ path }: { path: string }) {
  const home = path === "/" || path === "/index.html";
  const isApp = path === "/app" || path === "/app/";
  const field = useRef<HTMLCanvasElement>(null);

  // the app page is a working screen, so it has no background field
  useEffect(() => (field.current ? startField(field.current) : undefined), [isApp]);

  useEffect(() => {
    document.documentElement.classList.toggle("is-app", isApp);
    if (isApp) return;
    initScroll();
    const off = [watchFrame(), watchReveals()];
    return () => off.forEach((f) => f());
  }, [home, isApp]);

  if (isApp) return <AppPage />;

  return (
    <>
      <canvas ref={field} className="field" aria-hidden="true" />
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Frame home={home} />
      {home ? (
        <>
          <main id="main">
            <Hero />
            <File />
            <Ghost />
            <Ways />
          </main>
          <Footer />
        </>
      ) : (
        <NotFound />
      )}
    </>
  );
}
