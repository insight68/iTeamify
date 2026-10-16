"use client";
import { useCallback, type ReactNode } from "react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { ArrowLeft, MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@iteamify/ui/components/ui/tooltip";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@iteamify/ui/components/ui/resizable";
import { useIsMobile } from "@iteamify/ui/hooks/use-mobile";
import { AnimatedCollapsiblePanel, collapsiblePanelMotionProps, getAnimatedCollapsiblePanelInitialOpen, useAnimatedCollapsiblePanelState } from "../../layout/animated-collapsible-panel";
import { useT } from "../../i18n";
export function ChatShell({ listHeader, listBody, content, hasTarget, onBack }: {
    listHeader: ReactNode;
    listBody: ReactNode;
    content: ReactNode;
    hasTarget: boolean;
    onBack: () => void;
}) {
    const { t } = useT("chat");
    const isMobile = useIsMobile();
    const { defaultLayout, onLayoutChanged } = useDefaultLayout({
        id: "iteamify_chat_layout",
    });
    const listPanelRef = usePanelRef();
    const desktopListInitialOpen = getAnimatedCollapsiblePanelInitialOpen(true, defaultLayout, "list");
    const { open: desktopListOpen, visualOpen: desktopListVisualOpen, motionEnabled: desktopListMotionEnabled, beginToggle: beginDesktopListToggle, handleResize: handleDesktopListResize, } = useAnimatedCollapsiblePanelState(desktopListInitialOpen);
    const handleToggleConversationList = useCallback(() => {
        const panel = listPanelRef.current;
        if (!panel)
            return;
        const nextOpen = panel.isCollapsed();
        beginDesktopListToggle(nextOpen);
        window.requestAnimationFrame(() => {
            if (nextOpen)
                panel.expand();
            else
                panel.collapse();
        });
    }, [beginDesktopListToggle, listPanelRef]);
    // -- Mobile: list / content toggle -----------------------------------
    if (isMobile) {
        if (hasTarget) {
            return (<div className="flex flex-1 flex-col min-h-0">
          <div className="flex h-12 shrink-0 items-center border-b px-2">
            <Button variant="ghost" size="sm" onClick={() => {
                    onBack();
                }} className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4"/>
              {t(($) => $.page.title)}
            </Button>
          </div>
          {content}
        </div>);
        }
        return (<div className="flex flex-1 flex-col min-h-0">
        {listHeader}
        <div className="flex-1 min-h-0 overflow-y-auto">{listBody}</div>
      </div>);
    }
    // -- Desktop: resizable two-panel. The content pane appears only once
    // there is a chat target — an open thread or a new chat whose agent was just
    // picked via ⊕. With nothing selected there is no agent, so we show a neutral
    // prompt instead of an orphaned compose box. -------------------------------
    const contentListLabel = desktopListOpen
        ? t(($) => $.page.hide_conversations)
        : t(($) => $.page.show_conversations);
    return (<ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      <ResizablePanel id="list" {...collapsiblePanelMotionProps} data-collapsible-panel-motion={desktopListMotionEnabled ? "enabled" : undefined} defaultSize={desktopListOpen ? 320 : 0} minSize={240} maxSize={480} collapsedSize={0} collapsible groupResizeBehavior="preserve-pixel-size" panelRef={listPanelRef} onResize={handleDesktopListResize}>
        <AnimatedCollapsiblePanel side="left" open={desktopListVisualOpen} motionEnabled={desktopListMotionEnabled}>
          <div className="flex h-full flex-col">
            {listHeader}
            <div className="min-h-0 flex-1 overflow-y-auto">{listBody}</div>
          </div>
        </AnimatedCollapsiblePanel>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="detail" minSize="40%">
        <div className="relative flex h-full min-h-0 flex-col">
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={contentListLabel} className="absolute left-2 top-2 z-20 text-muted-foreground" onClick={handleToggleConversationList}/>}>
              {desktopListOpen ? (<PanelLeftClose className="h-4 w-4"/>) : (<PanelLeftOpen className="h-4 w-4"/>)}
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              {contentListLabel}
            </TooltipContent>
          </Tooltip>
          {hasTarget ? (content) : (<div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30"/>
              <p className="text-sm">{t(($) => $.page.select_prompt)}</p>
            </div>)}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>);
}
