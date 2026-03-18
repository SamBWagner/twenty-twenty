interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export default function FloatingAvatars({ users }: { users: PresenceUser[] }) {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {users.map((u) => {
        const h = hash(u.userId);
        const patternIndex = h % 4;
        const duration = 40 + (hash(u.userId + "d") % 30);
        const startX = hash(u.userId + "x") % 70 + 5;
        const startY = hash(u.userId + "y") % 70 + 5;
        const delay = -(hash(u.userId + "t") % 20);

        return (
          <div
            key={u.userId}
            className="absolute w-16 h-16 border-3 border-secondary/10 opacity-[0.07]"
            style={{
              animationName: `float-${patternIndex}`,
              animationDuration: `${duration}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDelay: `${delay}s`,
              left: `${startX}%`,
              top: `${startY}%`,
            }}
          >
            {u.avatarUrl ? (
              <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-tertiary/50 flex items-center justify-center text-2xl font-bold text-secondary/20">
                {u.username[0]?.toUpperCase()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
