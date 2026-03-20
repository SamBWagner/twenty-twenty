import { useAuthSession } from "../../lib/client-auth";

function isPublicEntryPath(pathname: string): boolean {
  return pathname === "/"
    || pathname === "/login"
    || pathname.startsWith("/auth/")
    || pathname.startsWith("/join/")
    || pathname.startsWith("/summary/")
    || pathname.startsWith("/projects/invite/");
}

function getOptimisticHref(pathname: string): string {
  return isPublicEntryPath(pathname) ? "/" : "/projects";
}

export default function BrandLink({
  className,
  currentPathname,
}: {
  className: string;
  currentPathname: string;
}) {
  const { viewer, loading, error } = useAuthSession();
  const optimisticHref = getOptimisticHref(currentPathname);

  const href = viewer
    ? "/projects"
    : (loading || error ? optimisticHref : "/");

  return (
    <a href={href} className={className}>
      Twenty Twenty
    </a>
  );
}
