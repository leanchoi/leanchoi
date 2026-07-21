// Side-effect / loosely-typed module declarations for Leaflet plugins that
// ship no TypeScript definitions. We access their APIs through narrow casts in
// the viewer, so a permissive declaration is enough to keep the build strict
// elsewhere.

declare module "@raruto/leaflet-elevation";
declare module "@raruto/leaflet-elevation/dist/leaflet-elevation.min.css";
declare module "leaflet-gpx";
declare module "leaflet.smooth_marker_bouncing";
declare module "swiper/css";
