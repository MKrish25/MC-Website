import { useEffect } from 'react';
import { initLoader } from '../fx/loader';

// Opening 3D-camera sequence, ported verbatim (see src/fx/loader.js).
// Renders once and never updates, so the module's .remove() cleanup is safe.
export default function Loader() {
  useEffect(() => {
    document.body.classList.add('loading');
    initLoader();
  }, []);
  return (
    <>
      <div id="loader" role="status" aria-label="Loading Media Club">
        <canvas id="loaderCanvas" aria-hidden="true"></canvas>
        <div className="loader-mark" id="loaderMark">MEDIA CLUB</div>
      </div>
      <div className="loader-flash" id="loaderFlash"></div>
    </>
  );
}
