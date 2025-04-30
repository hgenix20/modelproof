import { ReactNode } from "react";

interface LayoutProps {
  chat: ReactNode;
  audit: ReactNode;
}

export function Layout({ chat, audit }: LayoutProps) {
  return (
    <div className="min-h-screen w-screen flex flex-col md:flex-row bg-gray-50 text-gray-900">
      {/* Chat Panel */}
      <div className="w-full md:flex-1 flex flex-col p-4 border-b md:border-b-0 md:border-r border-gray-300 overflow-y-auto h-full">
        {chat}
      </div>

      {/* Audit Panel */}
      <div className="w-full md:w-1/3 flex flex-col p-4 bg-white overflow-y-auto h-full border-t md:border-t-0">
        {audit}
      </div>
    </div>
  );
}