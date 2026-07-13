/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    // Las imagenes se cargan directo desde el origen (sin optimizador server-side):
    // evita depender de sharp y de egress del servidor. Si mas adelante subis
    // imagenes propias al VPS, sacar esta linea y agregar sharp al Dockerfile.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "**.mlstatic.com" },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
};

export default nextConfig;
