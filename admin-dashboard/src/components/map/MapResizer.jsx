import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/** Keeps Leaflet sized correctly when its flex/grid container resizes. */
export default function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    const timer = setTimeout(() => map.invalidateSize(), 200);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [map]);
  return null;
}
