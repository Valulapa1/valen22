/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      // Las landings son HTML estáticos servidos desde public/. Los rewrites se
      // resuelven antes que el filesystem.
      beforeFiles: [
        // Home: página personal de Valentina (programas, historia, testimonios).
        { source: "/", destination: "/inicio.html" },
        // Landing del evento con la venta de entradas.
        { source: "/estoy-para-mas", destination: "/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/assets/img/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
