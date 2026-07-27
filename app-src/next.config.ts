import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'docxtemplater', 'pizzip', 'docxtemplater-image-module-free', 'exceljs', 'xlsx'],
  outputFileTracingIncludes: {
    '/api/generate-docx': ['./public/templates/**/*'],
    '/api/analyze-voyage-logs': ['./public/templates/Vessel_Daily_Logs_&Voyage.xlsx'],
    '/api/generate-voyage-report': ['./public/templates/Vessel_Daily_Logs_&Voyage.xlsx'],
  },
};

export default nextConfig;
