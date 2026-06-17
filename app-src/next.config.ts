import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'docxtemplater', 'pizzip', 'docxtemplater-image-module-free', 'exceljs'],
  outputFileTracingIncludes: {
    '/api/generate-docx': ['./public/templates/**/*'],
  },
};

export default nextConfig;
