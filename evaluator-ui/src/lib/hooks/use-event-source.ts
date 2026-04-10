import { useEffect, useEffectEvent } from "react";

interface UseEventSourceOptions {
  url: string;
  enabled: boolean;
  onMessage: (data: string, close: () => void) => void;
  onError?: (close: () => void) => void;
}

export function useEventSource({
  url,
  enabled,
  onMessage,
  onError,
}: UseEventSourceOptions): void {
  const onMessageEvent = useEffectEvent(
    (eventSource: EventSource, data: string) => {
      onMessage(data, () => {
        eventSource.close();
      });
    },
  );

  const onErrorEvent = useEffectEvent((eventSource: EventSource) => {
    if (onError) {
      onError(() => {
        eventSource.close();
      });
      return;
    }

    eventSource.close();
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      onMessageEvent(eventSource, event.data);
    };

    eventSource.onerror = () => {
      onErrorEvent(eventSource);
    };

    return () => {
      eventSource.close();
    };
  }, [enabled, url]);
}
