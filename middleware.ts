export { default } from 'next-auth/middleware';

export const config = {
  matcher: ['/boards/:path*', '/admin/:path*'],
};
