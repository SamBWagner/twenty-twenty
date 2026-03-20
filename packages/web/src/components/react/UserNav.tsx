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
    <div className="flex max-w-full min-w-0 items-center justify-end gap-2">
      {viewer.image && <img src={viewer.image} alt="" className="h-9 w-9 shrink-0 border-3 border-secondary shadow-brutal-sm" />}
      <span className="max-w-[min(42vw,16rem)] truncate border-3 border-secondary bg-white px-3 py-1 text-sm font-bold shadow-brutal-sm sm:max-w-[18rem]">
        {viewer.name}
      </span>
    </div>
  );
}
