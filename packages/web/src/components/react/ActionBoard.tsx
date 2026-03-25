import { useEffect, useState, useRef } from "react";
import type {
  Action,
  RetroItem as Item,
  WsEvent,
} from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";

const cardRotations = [
  "rotate-[-1.5deg]", "rotate-[0.5deg]", "rotate-[-0.5deg]", "rotate-[1.5deg]",
  "rotate-[0deg]", "rotate-[-1deg]", "rotate-[1deg]", "rotate-[-0.5deg]",
];

export default function ActionBoard({
  sessionId,
  readOnly,
  onRegisterWsHandler,
}: {
  sessionId: string;
  readOnly: boolean;
  onRegisterWsHandler: (handler: (event: WsEvent) => void) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Item[]>(`/api/sessions/${sessionId}/items`),
      api.get<Action[]>(`/api/sessions/${sessionId}/actions`),
    ])
      .then(([i, a]) => {
        setItems(i);
        setActions(a);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load."));
  }, [sessionId]);

  useEffect(() => {
    onRegisterWsHandler((event: WsEvent) => {
      switch (event.type) {
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

  async function addAction(description: string) {
    const action = await api.post<Action>(`/api/sessions/${sessionId}/actions`, { description });
    setActions((prev) => [...prev, action]);
  }

  async function updateAction(actionId: string, updates: { description?: string }) {
    const updated = await api.patch<Action>(`/api/sessions/${sessionId}/actions/${actionId}`, updates);
    setActions((prev) => prev.map((a) => (a.id === actionId ? updated : a)));
  }

  async function deleteAction(actionId: string) {
    await api.delete(`/api/sessions/${sessionId}/actions/${actionId}`);
    setActions((prev) => prev.filter((a) => a.id !== actionId));
  }

  // Sort all items by vote count for hot topics
  const allItemsSorted = [...items].sort((a, b) => b.voteCount - a.voteCount);
  const hotTopicIds = new Set(allItemsSorted.slice(0, 3).filter((i) => i.voteCount > 0).map((i) => i.id));

  const goodItems = items.filter((i) => i.type === "good").sort((a, b) => b.voteCount - a.voteCount);
  const badItems = items.filter((i) => i.type === "bad").sort((a, b) => b.voteCount - a.voteCount);
  const hotTopics = allItemsSorted.slice(0, 3).filter((i) => i.voteCount > 0);

  return (
    <div>
      {loadError && <p className="mb-6 font-bold text-red-600">{loadError}</p>}

      {/* Actions Section */}
      <section
        className="note-shell rotate-[0.25deg] p-6"
        data-note-theme="plum"
        data-tape-position="top-center"
      >
        <div className="mb-6">
          <div className="mb-3 inline-block rotate-[-0.5deg] border-3 border-secondary bg-secondary px-5 py-2">
            <h2 className="text-lg font-bold uppercase text-white">Actions</h2>
          </div>
          <p className="scribble-help note-muted max-w-3xl text-base">
            Turn retro insights into concrete actions for the team.
          </p>
        </div>

        {/* Action Cards */}
        <div className="mb-8 space-y-4">
          {actions.map((action, i) => (
            <ActionCard
              key={action.id}
              action={action}
              readOnly={readOnly}
              rotation={i % 2 === 0 ? "rotate-[-0.3deg]" : "rotate-[0.3deg]"}
              onUpdate={(updates) => updateAction(action.id, updates)}
              onDelete={() => deleteAction(action.id)}
            />
          ))}
        </div>

        {!readOnly && (
          <NewActionForm onAdd={addAction} />
        )}

        {actions.length === 0 && readOnly && (
          <p className="scribble-help note-panel border-3 border-secondary px-4 py-3 text-base text-secondary/60">
            No actions were captured in this session.
          </p>
        )}
      </section>

      {/* Retro Items Section */}
      {items.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 inline-block rotate-[-0.5deg] border-3 border-secondary bg-secondary px-5 py-2">
            <h2 className="text-lg font-bold uppercase text-white">Retro Items</h2>
          </div>

          {/* Hot Topics */}
          {hotTopics.length > 0 && (
            <div className="mb-8">
              <div className="note-chip mb-3 inline-block rotate-[0.5deg] border-3 border-secondary px-4 py-2">
                <h3 className="text-sm font-bold uppercase">Hot Topics</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {hotTopics.map((item, i) => (
                  <ReadOnlyItemCard
                    key={item.id}
                    item={item}
                    rotation={cardRotations[i % cardRotations.length]}
                    highlight
                  />
                ))}
              </div>
            </div>
          )}

          {/* Went Well / Needs Work columns */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div
              className="note-shell rotate-[-0.35deg] p-5"
              data-note-theme="mint"
              data-tape-position="top-center"
            >
              <div className="mb-4 inline-block rotate-[-1deg] border-3 border-secondary note-accent px-5 py-2">
                <h3 className="text-lg font-bold uppercase">Went Well</h3>
              </div>
              <div className="space-y-4">
                {goodItems.filter((i) => !hotTopicIds.has(i.id)).map((item, i) => (
                  <ReadOnlyItemCard
                    key={item.id}
                    item={item}
                    rotation={cardRotations[i % cardRotations.length]}
                  />
                ))}
                {goodItems.filter((i) => !hotTopicIds.has(i.id)).length === 0 && (
                  <p className="scribble-help note-panel border-3 border-secondary px-4 py-3 text-base text-secondary/60">
                    All items are in hot topics above.
                  </p>
                )}
              </div>
            </div>

            <div
              className="note-shell rotate-[0.35deg] p-5"
              data-note-theme="blush"
              data-tape-position="top-right"
            >
              <div className="mb-4 inline-block rotate-[1deg] border-3 border-secondary note-accent px-5 py-2">
                <h3 className="text-lg font-bold uppercase">Needs Work</h3>
              </div>
              <div className="space-y-4">
                {badItems.filter((i) => !hotTopicIds.has(i.id)).map((item, i) => (
                  <ReadOnlyItemCard
                    key={item.id}
                    item={item}
                    rotation={cardRotations[(i + 3) % cardRotations.length]}
                  />
                ))}
                {badItems.filter((i) => !hotTopicIds.has(i.id)).length === 0 && (
                  <p className="scribble-help note-panel border-3 border-secondary px-4 py-3 text-base text-secondary/60">
                    All items are in hot topics above.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ReadOnlyItemCard({
  item,
  rotation,
  highlight = false,
}: {
  item: Item;
  rotation: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "relative z-0 border-3 border-secondary note-panel p-4 transition-all hover:z-10",
      rotation,
      highlight && "ring-2 ring-[#FDCA40] ring-offset-2",
    )}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{item.content}</p>
        <span className={cn(
          "shrink-0 rounded-full border-2 border-secondary px-2 py-0.5 font-mono text-xs font-bold",
          item.voteCount > 0 ? "bg-[#FDCA40] text-secondary" : "bg-white text-secondary/50",
        )}>
          {item.voteCount}
        </span>
      </div>
    </div>
  );
}

function ActionCard({
  action,
  readOnly,
  rotation,
  onUpdate,
  onDelete,
}: {
  action: Action;
  readOnly: boolean;
  rotation: string;
  onUpdate: (updates: { description?: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(action.description);

  return (
    <div
      className={cn("border-3 border-secondary bg-[#ede6fc] p-5", rotation)}
    >
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editValue.trim()) {
              onUpdate({ description: editValue.trim() });
              setEditing(false);
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="note-panel flex-1 border-3 border-secondary px-3 py-2 text-sm font-bold focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            className={cn(
              scrapbookButton({ tone: "mint", size: "compact", tilt: "left", depth: "sm" }),
              "border-3 border-secondary bg-[#7ce29a] px-3 py-2 text-sm font-bold uppercase",
            )}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setEditValue(action.description); setEditing(false); }}
            className={cn(
              scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
              "border-3 border-secondary note-panel px-3 py-2 text-sm font-bold uppercase",
            )}
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-bold">{action.description}</p>
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className={cn(
                  scrapbookButton({ tone: "plum", size: "compact", tilt: "flat", depth: "sm" }),
                  "note-chip border-2 border-secondary px-2 py-1 text-xs font-bold uppercase",
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
  );
}

function NewActionForm({
  onAdd,
}: {
  onAdd: (description: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          scrapbookButton({ tone: "plum", size: "regular", tilt: "left", depth: "md" }),
          "w-full border-3 border-secondary bg-[#8f63ef] px-5 py-4 text-base font-bold uppercase text-white",
        )}
      >
        + New Action
      </button>
    );
  }

  return (
    <div className="border-3 border-secondary bg-[#ede6fc] p-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-secondary/55">New Action</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!description.trim()) return;
          onAdd(description.trim());
          setDescription("");
          setIsOpen(false);
        }}
        className="space-y-3"
      >
        <input
          ref={inputRef}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Set up weekly check-ins..."
          className="note-panel w-full border-3 border-secondary px-4 py-3 text-sm font-medium focus:outline-none"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => { setDescription(""); setIsOpen(false); }}
            className={cn(
              scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
              "border-3 border-secondary note-panel px-3 py-2 text-sm font-bold uppercase",
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={cn(
              scrapbookButton({ tone: "plum", size: "compact", tilt: "left", depth: "sm" }),
              "border-3 border-secondary bg-[#8f63ef] px-4 py-2 text-sm font-bold uppercase text-white",
            )}
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
