import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import type { WsEvent } from "@twenty-twenty/shared";

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

  useEffect(() => {
    Promise.all([
      api.get<Item[]>(`/api/sessions/${sessionId}/items`),
      api.get<Bundle[]>(`/api/sessions/${sessionId}/bundles`),
      api.get<Action[]>(`/api/sessions/${sessionId}/actions`),
      api.get<Member[]>(`/api/projects/${projectId}/members`),
    ]).then(([i, b, a, m]) => {
      setItems(i);
      setBundles(b);
      setActions(a);
      setMembers(m);
    });
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
    const bundle = await api.post<Bundle>(`/api/sessions/${sessionId}/bundles`, { label: "New Action Group" });
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
      {/* Carried over from previous retro */}
      {carriedOverActions.length > 0 && (
        <div className="mb-10">
          <div className="mb-3 inline-block border-3 border-secondary bg-purple-300 px-4 py-2 rotate-[0.5deg]">
            <h3 className="text-sm font-bold uppercase">Carried Over from Last Retro</h3>
          </div>
          <p className="mb-4 text-secondary/50 font-medium text-sm">
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

      {/* Helper text */}
      {!readOnly && (
        <p className="mb-6 text-secondary/50 font-medium text-sm rotate-[0.3deg]">
          Create action groups for related retro items, then assign actions and owners to each. Start by creating an action group, then sort items into it.
        </p>
      )}

      {/* Unactioned items */}
      {unbundledItems.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 inline-block border-3 border-secondary bg-tertiary px-4 py-2 rotate-[-1deg]">
            <h3 className="text-sm font-bold uppercase">Unactioned Items</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {unbundledItems.map((item, i) => (
              <div
                key={item.id}
                className={`border-3 border-secondary p-3 ${
                  item.type === "good" ? "bg-green-100" : "bg-red-100"
                } ${i % 2 === 0 ? "rotate-[-0.5deg]" : "rotate-[0.5deg]"}`}
              >
                <p className="text-sm font-medium">{item.content}</p>
                <div className="mt-2 flex items-center justify-between">
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

      {!readOnly && (
        <button
          onClick={createBundle}
          className="mb-8 border-3 border-dashed border-secondary px-6 py-3 font-bold uppercase text-secondary/40 transition-all hover:border-solid hover:bg-tertiary hover:text-secondary hover:shadow-brutal hover:rotate-[-1deg]"
        >
          + New Action Group
        </button>
      )}

      {/* Bundles */}
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
    </div>
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

  return (
    <div className={`border-3 border-secondary bg-white ${rotation}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b-3 border-secondary bg-primary px-5 py-3">
        {readOnly ? (
          <h3 className="font-bold uppercase text-white text-lg">{bundle.label || "Unnamed Action Group"}</h3>
        ) : (
          <input
            type="text"
            value={bundle.label || ""}
            onChange={(e) => onUpdateLabel(e.target.value)}
            placeholder="Action group name..."
            className="bg-transparent font-bold uppercase text-white text-lg placeholder-white/40 border-b-2 border-transparent focus:border-white/50 focus:outline-none"
          />
        )}
        {!readOnly && (
          <button
            onClick={onDeleteBundle}
            className="border-2 border-white/40 px-2 py-0.5 text-xs font-bold uppercase text-white/60 hover:border-white hover:text-white transition-colors"
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
                <button onClick={() => onRemoveItem(item.id)} className="text-xs font-bold text-secondary/20 hover:text-red-500">✕</button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-secondary/30 py-2 font-medium">No items yet — use the "→ Action group..." dropdown on unactioned items above</p>}
      </div>

      {/* Actions section */}
      <div className="border-t-3 border-secondary bg-surface p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-secondary/40 mb-3">
          What should we do about this?
        </h4>
        <div className="space-y-2 mb-3">
          {actions.map((action) => (
            <div key={action.id} className="flex items-center justify-between border-2 border-secondary bg-white px-3 py-2">
              <span className="text-sm font-bold">{action.description}</span>
              {!readOnly && (
                <button onClick={() => onDeleteAction(action.id)} className="text-xs font-bold text-secondary/20 hover:text-red-500">✕</button>
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
              className="border-3 border-secondary bg-primary px-4 py-2 text-sm font-bold uppercase text-white transition-all hover:shadow-brutal-sm"
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
              className="border-3 border-secondary bg-green-300 px-3 py-2 text-sm font-bold uppercase transition-all hover:shadow-brutal-sm"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditValue(action.description); setEditing(false); }}
              className="border-3 border-secondary bg-white px-3 py-2 text-sm font-bold uppercase transition-all hover:shadow-brutal-sm"
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
                  className="border-2 border-secondary bg-white px-2 py-1 text-xs font-bold uppercase text-secondary/50 hover:text-secondary transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  className="text-xs font-bold text-secondary/20 hover:text-red-500 transition-colors"
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
