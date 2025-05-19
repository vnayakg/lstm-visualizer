/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true, // Disable default image optimization
  },
  assetPrefix: isProd ? '/lsm-tree-visualizer/' : '',
  basePath: isProd ? '/lsm-tree-visualizer' : '',
  output: 'export'
};

export default nextConfig;
