const isStaticExport =
  process.env.GITHUB_ACTIONS === "true" || process.env.STATIC_EXPORT === "true";

const repoName = process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_REPOSITORY.split("/")[1]
  : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isStaticExport
    ? {
        output: "export",
        basePath: repoName ? `/${repoName}` : "",
        assetPrefix: repoName ? `/${repoName}/` : "",
      }
    : {}),
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.pollinations.ai",
      },
      {
        protocol: "https",
        hostname: "**.suno.ai",
      },
      {
        protocol: "https",
        hostname: "**.suno.com",
      },
    ],
  },
};

export default nextConfig;
