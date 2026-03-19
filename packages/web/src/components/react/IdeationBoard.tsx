import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import type { WsEvent } from "@twenty-twenty/shared";
import { cn, scrapbookButton } from "../../lib/button-styles";

interface Item {
  id: string;
  type: "good" | "bad";
  content: string;
  voteCount: number;
  userVote: number;
  isOwn: boolean;
}

const cardRotations = [
  "rotate-[-1.5deg]", "rotate-[0.5deg]", "rotate-[-0.5deg]", "rotate-[1.5deg]",
  "rotate-[0deg]", "rotate-[-1deg]", "rotate-[1deg]", "rotate-[-0.5deg]",
];

export default function IdeationBoard({
  sessionId,
  readOnly,
  onRegisterWsHandler,
}: {
  sessionId: string;
  readOnly: boolean;
  onRegisterWsHandler: (handler: (event: WsEvent) => void) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [goodInput, setGoodInput] = useState("");
  const [badInput, setBadInput] = useState("");

  useEffect(() => {
    api.get<Item[]>(`/api/sessions/${sessionId}/items`).then(setItems);
  }, [sessionId]);

  useEffect(() => {
    onRegisterWsHandler((event: WsEvent) => {
      switch (event.type) {
        case "item:created":
          setItems((prev) => [...prev, { ...event.payload, userVote: 0, isOwn: false } as Item]);
          break;
        case "item:deleted":
          setItems((prev) => prev.filter((i) => i.id !== event.payload.id));
          break;
        case "vote:updated":
          setItems((prev) =>
            prev.map((i) => (i.id === event.payload.itemId ? { ...i, voteCount: event.payload.voteCount } : i)),
          );
          break;
      }
    });
  }, [onRegisterWsHandler]);

  async function addItem(type: "good" | "bad") {
    const content = type === "good" ? goodInput : badInput;
    if (!content.trim()) return;
    const item = await api.post<Item>(`/api/sessions/${sessionId}/items`, { type, content });
    setItems((prev) => [...prev, item]);
    if (type === "good") setGoodInput("");
    else setBadInput("");
  }

  async function vote(itemId: string, value: 1 | -1) {
    const result = await api.post<{ itemId: string; voteCount: number; userVote: number }>(
      `/api/sessions/${sessionId}/items/${itemId}/vote`,
      { value },
    );
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, voteCount: result.voteCount, userVote: result.userVote } : i)),
    );
  }

  async function deleteItem(itemId: string) {
    await api.delete(`/api/sessions/${sessionId}/items/${itemId}`);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  const goodItems = items.filter((i) => i.type === "good").sort((a, b) => b.voteCount - a.voteCount);
  const badItems = items.filter((i) => i.type === "bad").sort((a, b) => b.voteCount - a.voteCount);

  return (
    <div className="grid grid-cols-2 gap-8">
      <div>
        <div className="mb-4 inline-block rotate-[-1deg] border-3 border-secondary bg-green-300 px-5 py-2">
          <h2 className="text-lg font-bold uppercase">✓ Went Well</h2>
        </div>
        <div className="mb-5 space-y-10">
          {goodItems.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              onVote={vote}
              onDelete={deleteItem}
              color="green"
              rotation={cardRotations[i % cardRotations.length]}
              readOnly={readOnly}
            />
          ))}
        </div>
        {readOnly ? (
          <p className="border-3 border-secondary bg-white px-4 py-3 text-sm font-medium text-secondary/60">
            This section is read-only now, but you can still look back through everything that was captured.
          </p>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); addItem("good"); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={goodInput}
              onChange={(e) => setGoodInput(e.target.value)}
              placeholder="Something that went well..."
              className="flex-1 border-3 border-secondary bg-white px-4 py-3 font-medium shadow-brutal-sm transition-shadow focus:shadow-brutal-primary focus:outline-none"
            />
            <button
              type="submit"
              className={cn(
                scrapbookButton({ tone: "success", size: "compact", tilt: "left", depth: "sm" }),
                "border-3 border-secondary bg-green-300 px-5 py-3 font-bold uppercase",
              )}
            >
              +
            </button>
          </form>
        )}
      </div>

      <div>
        <div className="mb-4 inline-block rotate-[1deg] border-3 border-secondary bg-red-300 px-5 py-2">
          <h2 className="text-lg font-bold uppercase">✗ Needs Work</h2>
        </div>
        <div className="mb-5 space-y-10">
          {badItems.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              onVote={vote}
              onDelete={deleteItem}
              color="red"
              rotation={cardRotations[(i + 3) % cardRotations.length]}
              readOnly={readOnly}
            />
          ))}
        </div>
        {readOnly ? (
          <p className="border-3 border-secondary bg-white px-4 py-3 text-sm font-medium text-secondary/60">
            Live editing has moved on, but the ideas from this stage stay available here for reference.
          </p>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); addItem("bad"); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={badInput}
              onChange={(e) => setBadInput(e.target.value)}
              placeholder="Something that could improve..."
              className="flex-1 border-3 border-secondary bg-white px-4 py-3 font-medium shadow-brutal-sm transition-shadow focus:shadow-brutal-primary focus:outline-none"
            />
            <button
              type="submit"
              className={cn(
                scrapbookButton({ tone: "danger", size: "compact", tilt: "right", depth: "sm" }),
                "border-3 border-secondary bg-red-300 px-5 py-3 font-bold uppercase",
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

function ItemCard({
  item,
  onVote,
  onDelete,
  color,
  rotation,
  readOnly,
}: {
  item: Item;
  onVote: (id: string, value: 1 | -1) => void;
  onDelete: (id: string) => void;
  color: "green" | "red";
  rotation: string;
  readOnly: boolean;
}) {
  const bg = color === "green" ? "bg-green-50" : "bg-red-50";

  return (
    <div className={`relative z-0 border-3 border-secondary ${bg} p-4 transition-all hover:z-10 ${rotation}`}>
      <div className="absolute -left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1">
        <button
          onClick={() => onVote(item.id, 1)}
          disabled={readOnly}
          className={cn(
            scrapbookButton({
              tone: item.userVote === 1 ? "primary" : "neutral",
              size: "icon",
              tilt: "flat",
              depth: "sm",
            }),
            `h-7 w-7 border-2 border-secondary text-sm font-bold transition-colors ${
              item.userVote === 1 ? "bg-primary text-white" : "bg-white hover:bg-blue-200"
            } ${readOnly ? "cursor-not-allowed opacity-50" : ""}`,
          )}
        >
          ▲
        </button>
        <div className="flex h-7 w-7 items-center justify-center border-2 border-secondary bg-white font-mono text-xs font-bold">
          {item.voteCount}
        </div>
        <button
          onClick={() => onVote(item.id, -1)}
          disabled={readOnly}
          className={cn(
            scrapbookButton({
              tone: item.userVote === -1 ? "danger" : "neutral",
              size: "icon",
              tilt: "flat",
              depth: "sm",
            }),
            `h-7 w-7 border-2 border-secondary text-sm font-bold transition-colors ${
              item.userVote === -1 ? "bg-red-500 text-white" : "bg-white hover:bg-red-200"
            } ${readOnly ? "cursor-not-allowed opacity-50" : ""}`,
          )}
        >
          ▼
        </button>
      </div>

      <div className="ml-6">
        <p className="font-medium">{item.content}</p>
      </div>

      {item.isOwn && !readOnly && (
        <button
          onClick={() => onDelete(item.id)}
          className={cn(
            scrapbookButton({ tone: "danger", size: "icon", tilt: "flat", depth: "sm" }),
            "absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center border-2 border-secondary bg-white text-xs font-bold hover:bg-red-300",
          )}
        >
          ✕
        </button>
      )}
    </div>
  );
}
