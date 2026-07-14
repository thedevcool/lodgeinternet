"use client";
import { apiFetch } from "@/lib/apiClient";

import { useEffect, useState } from "react";
import { Wifi, Lock, RefreshCw } from "lucide-react";
import Logo from "@/components/Logo";

export default function MaintenancePage() {
  const [message, setMessage] = useState(
    "We're currently performing scheduled maintenance. We'll be back shortly.",
  );

  useEffect(() => {
    // Fetch the admin-set message fresh each load — bypasses any page cache
    apiFetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.lockdownMessage) setMessage(data.lockdownMessage);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo variant="dark" />
        </div>

        {/* Icon */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="w-24 h-24 bg-gradient-to-br from-red-400 to-red-600 rounded-3xl flex items-center justify-center shadow-lg">
            <Lock className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
            <Wifi className="w-5 h-5 text-white" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 via-blue-600 to-purple-500 bg-clip-text text-transparent mb-3">
          Site Temporarily Unavailable
        </h1>

        <p className="text-apple-gray-600 text-base leading-relaxed mb-6">
          {message}
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-apple-gray-200" />
          <span className="text-xs text-apple-gray-400 font-medium uppercase tracking-wider">
            Lodge Internet
          </span>
          <div className="flex-1 h-px bg-apple-gray-200" />
        </div>

        {/* Reload button */}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-apple-gray-200 text-apple-gray-700 font-medium rounded-2xl hover:bg-apple-gray-50 transition-colors shadow-sm text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Check again
        </button>

        <p className="mt-6 text-xs text-apple-gray-400">
          If you need immediate assistance, please contact your hostel
          management.
        </p>
      </div>
    </div>
  );
}
