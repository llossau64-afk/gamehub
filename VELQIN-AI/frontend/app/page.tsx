"use client";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { LoadingScreen } from "@/components/layout/loading-screen";

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ChatView />
    </Suspense>
  );
}
