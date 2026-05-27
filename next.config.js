/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
      { source: '/admin', destination: '/admin/index.html' },
      { source: '/about', destination: '/about.html' },
      { source: '/contact', destination: '/contact.html' },
      { source: '/blog', destination: '/blog.html' },
      { source: '/privacy', destination: '/privacy.html' },
      { source: '/terms', destination: '/terms.html' },
      { source: '/affiliate', destination: '/affiliate.html' },
      { source: '/disclaimer', destination: '/disclaimer.html' },
    ];
  },
};

module.exports = nextConfig;
