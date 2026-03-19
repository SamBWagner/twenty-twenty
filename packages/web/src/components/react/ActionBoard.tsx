import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import type { WsEvent } from "@twenty-twenty/shared";
import { cn, scrapbookButton } from "../../lib/button-styles";
import MarchingAnts from "./MarchingAnts";

interface Item {
  id: string;
  type: "good" | "bad";
  content: string;
  voteCount: number;
  authorId?: string;
}

interface Bundle {
  id: string;
  label: string | null;
  itemIds: string[];
}

interface Action {
  id: string;
  description: string;
  bundleId: string | null;
  assigneeId: string | null;
}

interface Member {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

const bundleRotations = ["rotate-[-0.5deg]", "rotate-[0.5deg]", "rotate-[0deg]", "rotate-[-0.3deg]"];

export default function ActionBoard({
  sessionId,
  projectId,
  readOnly,
  onRegisterWsHandler,
}: {
  sessionId: string;
  projectId: string;
  readOnly: boolean;
  onRegisterWsHandler: (handler: (event: WsEvent) => void) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Item[]>(`/api/sessions/${sessionId}/items`),
      api.get<Bundle[]>(`/api/sessions/${sessionId}/bundles`),
      api.get<Action[]>(`/api/sessions/${sessionId}/actions`),
      api.get<Member[]>(`/api/projects/${projectId}/members`),
    ])
      .then(([i, b, a, m]) => {
        setItems(i);
        setBundles(b);
        setActions(a);
        setMembers(m);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load the action board."));
  }, [sessionId, projectId]);

  useEffect(() => {
    onRegisterWsHandler((event: WsEvent) => {
      switch (event.type) {
        case "bundle:created":
          setBundles((prev) => [...prev, event.payload as Bundle]);
          break;
        case "bundle:updated":
          setBundles((prev) => prev.map((b) => (b.id === event.payload.id ? (event.payload as Bundle) : b)));
          break;
        case "bundle:deleted":
          setBundles((prev) => prev.filter((b) => b.id !== event.payload.id));
          break;
        case "action:created":
          setActions((prev) => [...prev, event.payload as Action]);
          break;
        case "action:updated":
          setActions((prev) => prev.map((a) => (a.id === event.payload.id ? (event.payload as Action) : a)));
          break;
        case "action:deleted":
          setActions((prev) => prev.filter((a) => a.id !== event.payload.id));
          break;
      }
    });
  }, [onRegisterWsHandler]);

  const bundledItemIds = new Set(bundles.flatMap((b) => b.itemIds));
  const unbundledItems = items.filter((i) => !bundledItemIds.has(i.id));

  async function createBundle() {
    const bundle = await api.post<Bundle>(`/api/sessions/${sessionId}/bundles`, { label: "" });
    setBundles((prev) => [...prev, bundle]);
  }

  async function addItemToBundle(bundleId: string, itemId: string) {
    const bundle = bundles.find((b) => b.id === bundleId);
    if (!bundle) return;
    const updated = await api.patch<Bundle>(`/api/sessions/${sessionId}/bundles/${bundleId}`, {
      itemIds: [...bundle.itemIds, itemId],
    });
    setBundles((prev) => prev.map((b) => (b.id === bundleId ? updated : b)));
  }

  async function removeItemFromBundle(bundleId: string, itemId: string) {
    const bundle = bundles.find((b) => b.id === bundleId);
    if (!bundle) return;
    const updated = await api.patch<Bundle>(`/api/sessions/${sessionId}/bundles/${bundleId}`, {
      itemIds: bundle.itemIds.filter((id) => id !== itemId),
    });
    setBundles((prev) => prev.map((b) => (b.id === bundleId ? updated : b)));
  }

  async function updateBundleLabel(bundleId: string, label: string) {
    await api.patch(`/api/sessions/${sessionId}/bundles/${bundleId}`, { label });
    setBundles((prev) => prev.map((b) => (b.id === bundleId ? { ...b, label } : b)));
  }

  async function deleteBundle(bundleId: string) {
    await api.delete(`/api/sessions/${sessionId}/bundles/${bundleId}`);
    setBundles((prev) => prev.filter((b) => b.id !== bundleId));
  }

  async function addAction(bundleId: string | null, description: string, assigneeId: string | null) {
    const action = await api.post<Action>(`/api/sessions/${sessionId}/actions`, { description, bundleId, assigneeId });
    setActions((prev) => [...prev, action]);
  }

  async function updateAction(actionId: string, description: string) {
    const updated = await api.patch<Action>(`/api/sessions/${sessionId}/actions/${actionId}`, { description });
    setActions((prev) => prev.map((a) => (a.id === actionId ? updated : a)));
  }

  async function deleteAction(actionId: string) {
    await api.delete(`/api/sessions/${sessionId}/actions/${actionId}`);
    setActions((prev) => prev.filter((a) => a.id !== actionId));
  }

  // Carried-over actions from the previous retro (no bundle)
  const carriedOverActions = actions.filter((a) => a.bundleId === null);

  return (
    <div>
      {loadError && <p className="mb-6 font-bold text-red-600">{loadError}</p>}
      <section className="rotate-[0.25deg] border-3 border-secondary bg-white p-6">
        <div className="mb-6">
          <div className="mb-3 inline-block rotate-[-0.5deg] border-3 border-secondary bg-purple-300 px-5 py-2">
            <h2 className="text-lg font-bold uppercase">Action Groups</h2>
          </div>
          <p className="scribble-help max-w-3xl text-base text-secondary/60">
            Group related retro notes together, turn them into concrete actions, and make sure someone owns the next step.
          </p>
        </div>

        {carriedOverActions.length > 0 && (
          <div className="mb-10">
            <div className="mb-3 inline-block border-3 border-secondary bg-purple-300 px-4 py-2 rotate-[0.5deg]">
              <h3 className="text-sm font-bold uppercase">Carried Over from Last Retro</h3>
            </div>
            <p className="scribble-help mb-4 text-base text-secondary/50">
              These actions weren't completed last time. Update them or add new actions below.
            </p>
            <div className="space-y-3">
              {carriedOverActions.map((action, i) => (
                <CarriedOverCard
                  key={action.id}
                  action={action}
                  readOnly={readOnly}
                  rotation={i % 2 === 0 ? "rotate-[-0.3deg]" : "rotate-[0.3deg]"}
                  onUpdate={(desc) => updateAction(action.id, desc)}
                  onDelete={() => deleteAction(action.id)}
                />
              ))}
            </div>
          </div>
        )}

        {unbundledItems.length > 0 && (
          <div className="mb-10">
            <div className="mb-3 inline-block border-3 border-secondary bg-tertiary px-4 py-2 rotate-[-1deg]">
              <h3 className="text-sm font-bold uppercase">Unactioned Items</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {unbundledItems.map((item, i) => (
                <div
                  key={item.id}
                  className={`border-3 border-secondary p-3 ${
                    item.type === "good" ? "bg-green-100" : "bg-red-100"
                  } ${i % 2 === 0 ? "rotate-[-0.5deg]" : "rotate-[0.5deg]"}`}
                >
                  <p className="text-sm font-medium">{item.content}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-bold text-secondary/40">{item.voteCount} votes</span>
                    {!readOnly && bundles.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) addItemToBundle(e.target.value, item.id);
                          e.target.value = "";
                        }}
                        className="border-2 border-secondary bg-white px-2 py-1 text-xs font-bold"
                      >
                        <option value="">→ Action group...</option>
                        {bundles.map((b) => (
                          <option key={b.id} value={b.id}>{b.label || "Unnamed Action Group"}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {bundles.length === 0 ? (
          <ActionGroupPlaceholder onCreate={createBundle} readOnly={readOnly} />
        ) : (
          <>
            <div className="space-y-8">
              {bundles.map((bundle, i) => {
                const bundleItems = items.filter((item) => bundle.itemIds.includes(item.id));
                const bundleActions = actions.filter((a) => a.bundleId === bundle.id);
                return (
                  <BundleCard
                    key={bundle.id}
                    bundle={bundle}
                    items={bundleItems}
                    actions={bundleActions}
                    members={members}
                    readOnly={readOnly}
                    rotation={bundleRotations[i % bundleRotations.length]}
                    onUpdateLabel={(label) => updateBundleLabel(bundle.id, label)}
                    onRemoveItem={(itemId) => removeItemFromBundle(bundle.id, itemId)}
                    onDeleteBundle={() => deleteBundle(bundle.id)}
                    onAddAction={(desc, assignee) => addAction(bundle.id, desc, assignee)}
                    onDeleteAction={deleteAction}
                  />
                );
              })}
            </div>

            {!readOnly && (
              <div className="mt-8">
                <ActionGroupPlaceholder onCreate={createBundle} readOnly={false} compact />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ActionGroupPlaceholder({
  onCreate,
  readOnly,
  compact = false,
}: {
  onCreate: () => void;
  readOnly: boolean;
  compact?: boolean;
}) {
  const content = (
    <MarchingAnts
      className={cn(
        "relative overflow-hidden transition-colors duration-150",
        compact ? "px-5 py-6" : "px-6 py-8",
        !readOnly && "group-hover:bg-tertiary/15 group-focus-visible:bg-tertiary/15",
      )}
    >
      <div className={cn("max-w-2xl", !compact && "md:pr-56")}>
        <p className="text-lg font-bold uppercase">
          {compact ? "Add another action group" : "No action groups yet."}
        </p>
        <p className="scribble-help mt-2 text-base text-secondary/60">
          {compact
            ? "Spin up another placeholder for related retro notes and the actions that come out of them."
            : "Create the first action group to gather related retro notes, then turn that pile into owned follow-up work."}
        </p>
        {!readOnly && (
          <span className="mt-4 inline-block border-3 border-secondary bg-white px-4 py-2 text-xs font-bold uppercase transition-colors duration-150 group-hover:bg-tertiary group-focus-visible:bg-tertiary">
            + New Action Group
          </span>
        )}
      </div>

      <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 md:block">
        <div className={cn("relative", compact ? "h-20 w-32" : "h-24 w-40")}>
          <div className="absolute bottom-1 left-6 h-14 w-24 border-3 border-secondary bg-white/60 transition-transform duration-150 group-hover:translate-x-3 group-hover:-translate-y-1 group-hover:rotate-[3deg] group-focus-visible:translate-x-3 group-focus-visible:-translate-y-1 group-focus-visible:rotate-[3deg]"></div>
          <div className="absolute bottom-3 left-3 h-14 w-24 border-3 border-secondary bg-surface/80 transition-transform duration-150 group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:rotate-[-2deg] group-focus-visible:translate-x-1 group-focus-visible:-translate-y-1 group-focus-visible:rotate-[-2deg]"></div>
          <div className="absolute bottom-5 left-0 h-14 w-24 border-3 border-secondary bg-white transition-transform duration-150 group-hover:-translate-y-2 group-hover:rotate-[1deg] group-focus-visible:-translate-y-2 group-focus-visible:rotate-[1deg]"></div>
        </div>
      </div>
    </MarchingAnts>
  );

  if (readOnly) {
    return content;
  }

  return (
    <button
      type="button"
      onClick={onCreate}
      className="group block w-full bg-transparent p-0 text-left focus:outline-none"
    >
      {content}
    </button>
  );
}

function BundleCard({
  bundle,
  items,
  actions,
  members,
  readOnly,
  rotation,
  onUpdateLabel,
  onRemoveItem,
  onDeleteBundle,
  onAddAction,
  onDeleteAction,
}: {
  bundle: Bundle;
  items: Item[];
  actions: Action[];
  members: Member[];
  readOnly: boolean;
  rotation: string;
  onUpdateLabel: (label: string) => void;
  onRemoveItem: (itemId: string) => void;
  onDeleteBundle: () => void;
  onAddAction: (description: string, assigneeId: string | null) => void;
  onDeleteAction: (actionId: string) => void;
}) {
  const [newAction, setNewAction] = useState("");
  const hasLabel = Boolean(bundle.label?.trim());

  return (
    <div className={`border-3 border-secondary bg-white ${rotation}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b-3 border-secondary bg-primary px-5 py-3">
        {readOnly ? (
          <h3 className="font-bold uppercase text-white text-lg">{bundle.label || "Unnamed Action Group"}</h3>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-white/40 bg-white/10 text-base font-black text-white/85">
              ✎
            </span>
            <input
              type="text"
              value={bundle.label || ""}
              onChange={(e) => onUpdateLabel(e.target.value)}
              placeholder="New Action Group"
              className={cn(
                "min-w-0 bg-transparent text-white text-lg focus:outline-none",
                hasLabel
                  ? "flex-1 border-b-2 border-transparent font-bold uppercase focus:border-white/50"
                  : "w-[min(26rem,calc(100%-1rem))] border-b-2 border-dashed border-white/70 text-[2rem] font-bold normal-case tracking-[0.02em] placeholder:text-white/90 focus:border-white scribble-text",
              )}
            />
          </div>
        )}
        {!readOnly && (
          <button
            onClick={onDeleteBundle}
            className={cn(
              scrapbookButton({ tone: "danger", size: "compact", tilt: "flat", depth: "sm" }),
              "border-2 border-secondary bg-white px-2 py-0.5 text-xs font-bold uppercase text-secondary hover:bg-[#ff7f7f] hover:text-white",
            )}
            aria-label="Delete action group"
          >
            ✕
          </button>
        )}
      </div>

      {/* Items */}
      <div className="p-4 space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between border-2 border-secondary px-3 py-2 ${
              item.type === "good" ? "bg-green-100" : "bg-red-100"
            }`}
          >
            <span className="text-sm font-medium">{item.content}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-secondary/30">{item.voteCount}</span>
              {!readOnly && (
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className={cn(
                    scrapbookButton({ tone: "danger", size: "icon", tilt: "flat", depth: "sm" }),
                    "flex h-6 w-6 items-center justify-center border-2 border-secondary bg-white text-xs font-bold hover:bg-red-200",
                  )}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="scribble-help py-2 text-base text-secondary/30">No items yet — use the "→ Action group..." dropdown on unactioned items above</p>}
      </div>

      {/* Actions section */}
      <div className="border-t-3 border-secondary bg-surface p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-secondary/40 mb-3">
          What should we do about this?
        </h4>
        <div className="space-y-2 mb-3">
          {actions.map((action) => (
            <div key={action.id} className="flex items-center justify-between border-2 border-secondary bg-tertiary px-3 py-2">
              <span className="text-sm font-bold">{action.description}</span>
              {!readOnly && (
                <button
                  onClick={() => onDeleteAction(action.id)}
                  className={cn(
                    scrapbookButton({ tone: "danger", size: "icon", tilt: "flat", depth: "sm" }),
                    "flex h-6 w-6 items-center justify-center border-2 border-secondary bg-white text-xs font-bold hover:bg-red-200",
                  )}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newAction.trim()) return;
              onAddAction(newAction, null);
              setNewAction("");
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
              placeholder="e.g. Set up weekly check-ins..."
              className="flex-1 border-3 border-secondary bg-white px-3 py-2 text-sm font-medium focus:outline-none"
            />
            <button
              type="submit"
              className={cn(
                scrapbookButton({ tone: "primary", size: "compact", tilt: "left", depth: "sm" }),
                "border-3 border-secondary bg-primary px-4 py-2 text-sm font-bold uppercase text-white",
              )}
            >
              +
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function CarriedOverCard({
  action,
  readOnly,
  rotation,
  onUpdate,
  onDelete,
}: {
  action: Action;
  readOnly: boolean;
  rotation: string;
  onUpdate: (description: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(action.description);

  return (
    <div className={`border-3 border-secondary bg-purple-50 ${rotation}`}>
      <div className="flex items-center justify-between border-b-3 border-secondary bg-purple-300 px-4 py-2">
        <span className="text-xs font-bold uppercase tracking-wider">From Previous Retro</span>
      </div>
      <div className="p-4">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editValue.trim()) {
                onUpdate(editValue.trim());
                setEditing(false);
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 border-3 border-secondary bg-white px-3 py-2 text-sm font-bold focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              className={cn(
                scrapbookButton({ tone: "success", size: "compact", tilt: "left", depth: "sm" }),
                "border-3 border-secondary bg-green-300 px-3 py-2 text-sm font-bold uppercase",
              )}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditValue(action.description); setEditing(false); }}
              className={cn(
                scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
                "border-3 border-secondary bg-white px-3 py-2 text-sm font-bold uppercase",
              )}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <p className="font-bold">{action.description}</p>
            {!readOnly && (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className={cn(
                    scrapbookButton({ tone: "warm", size: "compact", tilt: "flat", depth: "sm" }),
                    "border-2 border-secondary bg-tertiary px-2 py-1 text-xs font-bold uppercase",
                  )}
                >
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  className={cn(
                    scrapbookButton({ tone: "danger", size: "icon", tilt: "flat", depth: "sm" }),
                    "flex h-6 w-6 items-center justify-center border-2 border-secondary bg-white text-xs font-bold hover:bg-red-200",
                  )}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
