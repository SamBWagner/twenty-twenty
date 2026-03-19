import { useAuthSession } from "../../lib/client-auth";

export default function UserNav() {
  const { viewer, loading, error } = useAuthSession();

  if (loading) {
    return <span className="font-mono text-xs">Loading...</span>;
  }

  if (error || !viewer) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {viewer.image && <img src={viewer.image} alt="" className="h-9 w-9 border-3 border-secondary shadow-brutal-sm" />}
      <span className="border-3 border-secondary bg-white px-3 py-1 text-sm font-bold shadow-brutal-sm">{viewer.name}</span>
    </div>
  );
}
