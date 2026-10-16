import { useCallback, useMemo } from "react";
import {
  NavigationMinimap,
  type NavigationMinimapItem,
} from "../../common/navigation-minimap";
import { minimapMarkdownPreview } from "../../common/minimap-preview";
import { useT } from "../../i18n";

export interface ChatTurnMinimapTurn {
  id: string;
  content: string;
  attachmentCount: number;
  /** Zero-based position in the current Virtuoso data array. */
  renderIndex: number;
}

interface ChatTurnMinimapProps {
  turns: ChatTurnMinimapTurn[];
  activeTurnId: string | null;
  onJump: (renderIndex: number) => void;
  hasOlderMessages: boolean;
  isFetchingOlderMessages: boolean;
  onLoadOlderMessages?: () => void;
  className?: string;
}

export function ChatTurnMinimap({
  turns,
  activeTurnId,
  onJump,
  hasOlderMessages,
  isFetchingOlderMessages,
  onLoadOlderMessages,
  className,
}: ChatTurnMinimapProps) {
  const { t } = useT("chat");

  const items = useMemo<NavigationMinimapItem[]>(
    () =>
      turns.map((turn) => {
        const preview = minimapMarkdownPreview(turn.content);
        return {
          id: turn.id,
          title:
            preview.title ||
            t(($) => $.message_list.attachment_preview, {
              count: turn.attachmentCount,
            }),
          body: preview.body,
        };
      }),
    [t, turns],
  );

  const activeIds = useMemo(
    () => new Set(activeTurnId ? [activeTurnId] : []),
    [activeTurnId],
  );
  const renderIndexById = useMemo(
    () => new Map(turns.map((turn) => [turn.id, turn.renderIndex])),
    [turns],
  );
  const handleJump = useCallback(
    (id: string) => {
      const renderIndex = renderIndexById.get(id);
      if (renderIndex !== undefined) onJump(renderIndex);
    },
    [onJump, renderIndexById],
  );

  const leadingAction =
    hasOlderMessages && onLoadOlderMessages
      ? {
          label: isFetchingOlderMessages
            ? t(($) => $.message_list.loading_older)
            : t(($) => $.message_list.load_older),
          pending: isFetchingOlderMessages,
          onActivate: onLoadOlderMessages,
        }
      : undefined;

  return (
    <NavigationMinimap
      items={items}
      activeIds={activeIds}
      onJump={handleJump}
      ariaLabel={t(($) => $.message_list.turn_nav_label)}
      leadingAction={leadingAction}
      className={className}
    />
  );
}
