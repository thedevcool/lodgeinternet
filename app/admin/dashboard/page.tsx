"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import {
  KeyRound,
  Tv,
  Receipt,
  LogOut,
  Building2,
  BarChart3,
  DatabaseZap,
  Mail,
  ShieldCheck,
  Settings,
  Users,
  ListChecks,
  Activity,
} from "lucide-react";

const NAV_CARDS = [
  {
    module: "data-codes",
    href: "/admin/data-codes",
    label: "Data Codes",
    description: "Manage internet plans & codes",
    icon: <KeyRound className="w-6 h-6 text-white" />,
    gradient: "from-blue-400 to-blue-600",
    hover: "hover:border-blue-200",
  },
  {
    module: "tv-users",
    href: "/admin/tv-users",
    label: "TV Users",
    description: "Manage TV subscriptions",
    icon: <Tv className="w-6 h-6 text-white" />,
    gradient: "from-blue-400 via-blue-500 to-purple-400",
    hover: "hover:border-purple-200",
  },
  {
    module: "purchase-logs",
    href: "/admin/purchase-logs",
    label: "Purchase Logs",
    description: "View all customer purchases",
    icon: <Receipt className="w-6 h-6 text-white" />,
    gradient: "from-green-500 to-green-600",
    hover: "hover:border-green-200",
  },
  {
    module: "transactions",
    href: "/admin/transactions",
    label: "Transaction Audit",
    description: "Multi-hostel financial reports",
    icon: <BarChart3 className="w-6 h-6 text-white" />,
    gradient: "from-blue-500 to-indigo-600",
    hover: "hover:border-blue-200",
  },
  {
    module: "emails",
    href: "/admin/emails",
    label: "Email Management",
    description: "Send newsletters & announcements",
    icon: <Mail className="w-6 h-6 text-white" />,
    gradient: "from-blue-500 to-purple-600",
    hover: "hover:border-blue-200",
  },
  {
    module: "migrations",
    href: "/admin/migrations",
    label: "Migrations",
    description: "Run database migrations & fixes",
    icon: <DatabaseZap className="w-6 h-6 text-white" />,
    gradient: "from-violet-500 to-purple-600",
    hover: "hover:border-violet-200",
  },
  {
    module: "hostels",
    href: "/admin/hostels",
    label: "Hostel Management",
    description: "Add, edit & remove hostels",
    icon: <Building2 className="w-6 h-6 text-white" />,
    gradient: "from-amber-400 to-orange-500",
    hover: "hover:border-amber-200",
  },
  {
    module: "users",
    href: "/admin/users",
    label: "User Management",
    description: "View, search & manage user accounts",
    icon: <Users className="w-6 h-6 text-white" />,
    gradient: "from-teal-400 to-cyan-500",
    hover: "hover:border-teal-200",
  },
  {
    module: "waitlist",
    href: "/admin/waitlist",
    label: "Waitlist",
    description: "Demand signals & sign-ups by area",
    icon: <ListChecks className="w-6 h-6 text-white" />,
    gradient: "from-pink-400 to-rose-500",
    hover: "hover:border-pink-200",
  },
  {
    module: "bot-analytics",
    href: "/admin/bot-analytics",
    label: "Bot Analytics",
    description: "Monitor bot payment reliability",
    icon: <Activity className="w-6 h-6 text-white" />,
    gradient: "from-cyan-500 to-blue-600",
    hover: "hover:border-cyan-200",
  },
] as const;

export default function AdminDashboardPage() {
  const { logout, adminProfile, canAccess } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  const isSuperAdmin = adminProfile?.isSuperAdmin ?? false;
  const visibleCards = NAV_CARDS.filter((c) => canAccess(c.module));

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-apple-gray-50">
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Logo variant="dark" />
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-black-400 bg-clip-text text-transparent">
                    Admin Dashboard
                  </h1>
                  <p className="text-sm text-apple-gray-600">
                    Lodge Internet • Fast and Reliable Hostel Internet
                    {adminProfile && (
                      <span className="ml-2 text-apple-gray-400">
                        — {adminProfile.username}
                        {isSuperAdmin ? " (Super Admin)" : ""}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {visibleCards.map((card) => (
              <Link
                key={card.module}
                href={card.href}
                className={`flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-2 border-transparent ${card.hover}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 bg-gradient-to-r ${card.gradient} rounded-xl`}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-apple-gray-900">
                      {card.label}
                    </h3>
                    <p className="text-sm text-apple-gray-600">
                      {card.description}
                    </p>
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-apple-gray-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            ))}

            {/* Admin Management — super admin only */}
            {isSuperAdmin && (
              <Link
                href="/admin/admins"
                className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-blue-300"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-apple-gray-900">
                      Admin Management
                    </h3>
                    <p className="text-sm text-apple-gray-600">
                      Add admins, roles &amp; permissions
                    </p>
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-apple-gray-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            )}

            {/* Site Settings — super admin only */}
            {isSuperAdmin && (
              <Link
                href="/admin/settings"
                className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-red-200"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-r from-red-400 to-red-600 rounded-xl">
                    <Settings className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-apple-gray-900">
                      Site Settings
                    </h3>
                    <p className="text-sm text-apple-gray-600">
                      Lockdown toggle &amp; maintenance mode
                    </p>
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-apple-gray-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
