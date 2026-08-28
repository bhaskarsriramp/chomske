// backend/utils/getSubdomain.js
export default function getSubdomain(hostname = (typeof window !== 'undefined' ? window.location.hostname : '')) {
  if (!hostname) return null;
  const host = hostname.split(':')[0].toLowerCase();
  const parts = host.split('.');
  if (parts.length <= 2) return null;   // myhandle.in -> no subdomain
  if (parts[0] === 'www') return null;   // ignore www
  return parts.slice(0, parts.length - 2).join('.'); // handles a.b.myhandle.in -> a.b
}
