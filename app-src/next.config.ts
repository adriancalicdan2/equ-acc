import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'docxtemplater', 'pizzip', 'docxtemplater-image-module-free', 'exceljs', 'xlsx'],
  outputFileTracingIncludes: {
    '/api/generate-docx': ['./public/templates/**/*'],
    '/api/generate-voyage-report': ['./public/templates/DM5_Daily_Logs_&Voyage.xlsx'],
  },
};

export default nextConfig;
