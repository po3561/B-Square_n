import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const { pathname } = request.nextUrl;

  // Static assets and internal requests skip middleware processing
  if (
    pathname.includes('.') || 
    pathname.startsWith('/_next') || 
    pathname.startsWith('/api') ||
    pathname.startsWith('/pc') // Avoid infinite loops if we rewrite to /pc
  ) {
    return NextResponse.next();
  }

  // Specific Next.js routes that should NOT be rewritten to PC (available on both)
  const isNextRoute = 
    pathname === '/debug' || 
    pathname === '/login' || 
    pathname === '/signup' ||
    pathname.startsWith('/classes');

  if (isNextRoute) {
    return NextResponse.next();
  }

  // Routing Strategy:
  // Mobile/Tablet -> Next.js App Router (already handling /)
  // Desktop -> Legacy PC Web (served from public/pc)
  if (!isMobile) {
    // If accessing root, rewrite to the legacy entry point
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/pc/index.html', request.url));
    }
    
    // For other paths, try to find them in /pc
    // This is a catch-all for legacy files
    return NextResponse.rewrite(new URL(`/pc${pathname}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
