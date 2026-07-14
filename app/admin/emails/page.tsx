"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import Logo from "@/components/Logo";
import {
  LogOut,
  ArrowLeft,
  Mail,
  Send,
  Users,
  Tv,
  Wifi,
  Building2,
  X,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronDown,
  Loader2,
  UserCheck,
  Trash2,
  FileText,
  Save,
  BookOpen,
  ChevronRight,
  ImageIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import type { Hostel } from "@/types";

type RecipientGroup = "all" | "tv-users" | "data-users" | "specific";

interface Recipient {
  email: string;
  name: string;
}

/** Builds the Lodge Internet email template HTML for the iframe preview */
function buildPreviewHtml(content: string) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 32px; font-weight: 600; }
    .content { padding: 40px 30px; color: #1d1d1f; line-height: 1.6; }
    .content h1, .content h2, .content h3 { margin-top: 24px; margin-bottom: 8px; }
    .content p { margin: 0 0 16px 0; }
    .content ul, .content ol { margin: 0 0 16px 0; padding-left: 24px; }
    .content a { color: #60a5fa; }
    .content blockquote { border-left: 4px solid #a78bfa; margin: 0 0 16px 0; padding: 8px 16px; background: #f5f5f7; }
    .content hr { border: none; border-top: 1px solid #d2d2d7; margin: 24px 0; }
    .content img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 12px 0; }
    .footer { background-color: #f5f5f7; padding: 30px; text-align: center; color: #86868b; font-size: 14px; }
    .footer a { color: #0071e3; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Lodge Internet</h1></div>
    <div class="content">${content}</div>
    <div class="footer">
      <p>Lodge Internet</p>
      <p>&copy; ${year} Davo-Nexus Limited. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

interface RecipientOption {
  id: RecipientGroup;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const RECIPIENT_OPTIONS: RecipientOption[] = [
  {
    id: "all",
    label: "All Users",
    description: "Everyone who has purchased a plan (TV or data)",
    icon: <Users className='w-5 h-5' />,
    color: "from-blue-500 to-purple-600",
  },
  {
    id: "tv-users",
    label: "TV Subscribers",
    description: "Users with active or past TV subscriptions",
    icon: <Tv className='w-5 h-5' />,
    color: "from-blue-400 via-blue-500 to-purple-400",
  },
  {
    id: "data-users",
    label: "Data Code Buyers",
    description: "Users who have purchased data access codes",
    icon: <Wifi className='w-5 h-5' />,
    color: "from-green-500 to-green-600",
  },
  {
    id: "specific",
    label: "Specific Recipients",
    description: "Enter individual email addresses manually",
    icon: <Mail className='w-5 h-5' />,
    color: "from-amber-400 to-orange-500",
  },
];

// ─── Toolbar Button ────────────────────────────────────────────────────────────
function ToolbarBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`p-1.5 rounded-lg transition-colors text-sm font-medium min-w-[28px] ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-apple-gray-700 hover:bg-apple-gray-100"
      }`}>
      {children}
    </button>
  );
}

// ─── Rich Text Editor ─────────────────────────────────────────────────────────
function RichEditor({
  onChange,
  contentKey,
  initialContent,
}: {
  onChange: (html: string) => void;
  contentKey?: number;
  initialContent?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    content: initialContent || "",
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: "Write your message here…" }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      TextStyle,
      Link.configure({ openOnClick: false }),
      Image.configure({
        inline: false,
        HTMLAttributes: {
          style:
            "max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0;",
        },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[280px] px-5 py-4 text-apple-gray-900 focus:outline-none prose prose-sm max-w-none",
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  useEffect(() => {
    if (editor && initialContent !== undefined && contentKey !== undefined) {
      editor.commands.setContent(initialContent);
    }
  }, [contentKey]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Enter URL", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const uploadAndInsertImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploadError("");
      setUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiFetch("/api/admin/upload-email-image", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        editor
          .chain()
          .focus()
          .setImage({ src: data.url, alt: file.name })
          .run();
      } catch (err: any) {
        setUploadError(err.message || "Failed to upload image");
      } finally {
        setUploadingImage(false);
      }
    },
    [editor],
  );

  const handleImageButton = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadAndInsertImage(file);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [uploadAndInsertImage],
  );

  if (!editor) return null;

  return (
    <div className='border-2 border-apple-gray-200 rounded-2xl overflow-hidden focus-within:border-blue-400 transition-colors'>
      {/* Toolbar */}
      <div className='flex flex-wrap items-center gap-0.5 px-3 py-2 bg-apple-gray-50 border-b border-apple-gray-200'>
        {/* Text style */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title='Bold'>
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title='Italic'>
          <em>I</em>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title='Underline'>
          <span className='underline'>U</span>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title='Strike'>
          <span className='line-through'>S</span>
        </ToolbarBtn>

        <div className='w-px h-5 bg-apple-gray-300 mx-1' />

        {/* Headings */}
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading", { level: 1 })}
          title='Heading 1'>
          H1
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          title='Heading 2'>
          H2
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          title='Heading 3'>
          H3
        </ToolbarBtn>

        <div className='w-px h-5 bg-apple-gray-300 mx-1' />

        {/* Lists */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title='Bullet List'>
          <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 16 16'>
            <circle cx='2' cy='4.5' r='1.5' />
            <rect x='5' y='3.75' width='9' height='1.5' rx='0.75' />
            <circle cx='2' cy='8' r='1.5' />
            <rect x='5' y='7.25' width='9' height='1.5' rx='0.75' />
            <circle cx='2' cy='11.5' r='1.5' />
            <rect x='5' y='10.75' width='9' height='1.5' rx='0.75' />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title='Numbered List'>
          <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 16 16'>
            <text x='0' y='6' fontSize='6' fontWeight='bold'>
              1.
            </text>
            <rect x='5' y='3.75' width='9' height='1.5' rx='0.75' />
            <text x='0' y='9.5' fontSize='6' fontWeight='bold'>
              2.
            </text>
            <rect x='5' y='7.25' width='9' height='1.5' rx='0.75' />
            <text x='0' y='13' fontSize='6' fontWeight='bold'>
              3.
            </text>
            <rect x='5' y='10.75' width='9' height='1.5' rx='0.75' />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title='Blockquote'>
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            viewBox='0 0 16 16'>
            <path d='M2 5h4v4H4a2 2 0 01-2-2V5zm7 0h4v4h-2a2 2 0 01-2-2V5z' />
          </svg>
        </ToolbarBtn>

        <div className='w-px h-5 bg-apple-gray-300 mx-1' />

        {/* Alignment */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title='Align Left'>
          <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 16 16'>
            <rect x='1' y='2' width='14' height='1.5' rx='0.75' />
            <rect x='1' y='5.5' width='9' height='1.5' rx='0.75' />
            <rect x='1' y='9' width='14' height='1.5' rx='0.75' />
            <rect x='1' y='12.5' width='9' height='1.5' rx='0.75' />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title='Center'>
          <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 16 16'>
            <rect x='1' y='2' width='14' height='1.5' rx='0.75' />
            <rect x='3.5' y='5.5' width='9' height='1.5' rx='0.75' />
            <rect x='1' y='9' width='14' height='1.5' rx='0.75' />
            <rect x='3.5' y='12.5' width='9' height='1.5' rx='0.75' />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title='Align Right'>
          <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 16 16'>
            <rect x='1' y='2' width='14' height='1.5' rx='0.75' />
            <rect x='6' y='5.5' width='9' height='1.5' rx='0.75' />
            <rect x='1' y='9' width='14' height='1.5' rx='0.75' />
            <rect x='6' y='12.5' width='9' height='1.5' rx='0.75' />
          </svg>
        </ToolbarBtn>

        <div className='w-px h-5 bg-apple-gray-300 mx-1' />

        {/* Link */}
        <ToolbarBtn
          onClick={setLink}
          active={editor.isActive("link")}
          title='Insert Link'>
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            viewBox='0 0 16 16'>
            <path d='M6.5 9.5a3.5 3.5 0 004.95 0l2-2a3.5 3.5 0 00-4.95-4.95l-1 1' />
            <path d='M9.5 6.5a3.5 3.5 0 00-4.95 0l-2 2a3.5 3.5 0 004.95 4.95l1-1' />
          </svg>
        </ToolbarBtn>

        {/* Image */}
        <ToolbarBtn
          onClick={handleImageButton}
          title={uploadingImage ? "Uploading…" : "Insert Image"}>
          {uploadingImage ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <ImageIcon className='w-4 h-4' />
          )}
        </ToolbarBtn>
        <input
          ref={fileInputRef}
          type='file'
          accept='image/png,image/jpeg,image/jpg,image/webp,image/gif'
          className='hidden'
          onChange={handleFileChange}
        />

        {/* Horizontal rule */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title='Horizontal Rule'>
          <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 16 16'>
            <rect x='0' y='7.25' width='16' height='1.5' rx='0.75' />
          </svg>
        </ToolbarBtn>

        <div className='w-px h-5 bg-apple-gray-300 mx-1' />

        {/* Undo / Redo */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().undo().run()}
          title='Undo'>
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            viewBox='0 0 16 16'>
            <path d='M3 8a5 5 0 105-.5H3' />
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M2 5l1 3 3-1'
            />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().redo().run()}
          title='Redo'>
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            viewBox='0 0 16 16'>
            <path d='M13 8a5 5 0 11-5-.5H13' />
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M14 5l-1 3-3-1'
            />
          </svg>
        </ToolbarBtn>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className='flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700'>
          <AlertCircle className='w-3.5 h-3.5 flex-shrink-0' />
          <span className='flex-1'>{uploadError}</span>
          <button
            type='button'
            onClick={() => setUploadError("")}
            className='text-red-500 hover:text-red-700'>
            <X className='w-3 h-3' />
          </button>
        </div>
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmailsPage() {
  const { logout, canWrite, adminProfile } = useAuthStore();
  const canEdit = canWrite("emails");
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [recipientGroup, setRecipientGroup] = useState<RecipientGroup>("all");
  const [hostelFilter, setHostelFilter] = useState("");
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const allowedHostels = useMemo(
    () =>
      !adminProfile?.hostels?.length || adminProfile.isSuperAdmin
        ? hostels
        : hostels.filter((h) => adminProfile.hostels.includes(h.id)),
    [hostels, adminProfile],
  );
  const [specificInput, setSpecificInput] = useState("");
  const [specificEmails, setSpecificEmails] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    sent?: number;
    failed?: number;
    total?: number;
    error?: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Recipient preview state (for all / tv-users / data-users groups)
  const [loadedRecipients, setLoadedRecipients] = useState<Recipient[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipientLoadError, setRecipientLoadError] = useState("");
  const loadAbortRef = useRef<AbortController | null>(null);

  // Templates & Drafts
  interface Draft {
    id: string;
    subject: string;
    html: string;
    createdAt: string;
    updatedAt: string;
  }
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [showSaveDraftPrompt, setShowSaveDraftPrompt] = useState(false);
  const [editorContentKey, setEditorContentKey] = useState(0);
  const [editorInitialContent, setEditorInitialContent] = useState("");

  const EMAIL_TEMPLATES = [
    {
      name: "Welcome",
      subject: "Welcome to Lodge Internet!",
      html: "<h2>Welcome to Lodge Internet!</h2><p>We're glad to have you on board. Thank you for choosing Lodge Internet for your hostel connectivity needs.</p><p>If you have any questions about your plan or need assistance, don't hesitate to reach out to our support team.</p><p>Enjoy fast and reliable internet!</p>",
    },
    {
      name: "Maintenance",
      subject: "Scheduled Maintenance Notice",
      html: "<h2>Scheduled Maintenance Notice</h2><p>We want to let you know that we'll be performing scheduled maintenance on our network.</p><p><strong>Date:</strong> [Date]<br/><strong>Time:</strong> [Time]<br/><strong>Duration:</strong> [Duration]</p><p>During this time, internet access may be temporarily unavailable. We apologize for any inconvenience and appreciate your patience.</p>",
    },
    {
      name: "New Plans",
      subject: "Exciting New Plans Available!",
      html: "<h2>New Plans Available!</h2><p>We're excited to announce new internet plans designed to give you even more value.</p><p>Check out the latest plans on our website and find the one that suits your browsing needs best.</p><p>Upgrade today and enjoy faster speeds and better connectivity!</p>",
    },
    {
      name: "Payment Reminder",
      subject: "Friendly Payment Reminder",
      html: "<h2>Payment Reminder</h2><p>This is a friendly reminder about your Lodge Internet subscription.</p><p>To continue enjoying uninterrupted internet access, please ensure your payment is up to date.</p><p>If you've already made your payment, please disregard this message. Thank you!</p>",
    },
    {
      name: "Announcement",
      subject: "",
      html: "<h2>Important Announcement</h2><p>Dear valued user,</p><p>[Your announcement here]</p><p>Thank you for being part of the Lodge Internet community.</p>",
    },
  ];

  const fetchDrafts = async () => {
    setLoadingDrafts(true);
    try {
      const res = await apiFetch("/api/admin/email-drafts");
      const data = await res.json();
      if (res.ok) setDrafts(data.drafts ?? []);
    } catch {
      // non-critical
    } finally {
      setLoadingDrafts(false);
    }
  };

  const saveDraft = async () => {
    if (!subject.trim()) {
      alert("Please enter a subject before saving.");
      return;
    }
    setSavingDraft(true);
    try {
      const res = await apiFetch("/api/admin/email-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html }),
      });
      if (res.ok) {
        await fetchDrafts();
        setShowSaveDraftPrompt(false);
      }
    } catch {
      // non-critical
    } finally {
      setSavingDraft(false);
    }
  };

  const deleteDraft = async (id: string) => {
    try {
      await apiFetch("/api/admin/email-drafts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // non-critical
    }
  };

  const loadDraft = (draft: Draft) => {
    setSubject(draft.subject);
    setHtml(draft.html);
    setEditorInitialContent(draft.html);
    setEditorContentKey((k) => k + 1);
    setShowDrafts(false);
  };

  const loadTemplate = (template: {
    name: string;
    subject: string;
    html: string;
  }) => {
    setSubject(template.subject);
    setHtml(template.html);
    setEditorInitialContent(template.html);
    setEditorContentKey((k) => k + 1);
  };

  // Fetch drafts on mount
  useEffect(() => {
    fetchDrafts();
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  // Load hostels for the filter dropdown
  useEffect(() => {
    apiFetch("/api/hostels")
      .then((r) => r.json())
      .then((data) => {
        const all: Hostel[] = data.hostels ?? [];
        setHostels(all);
        // Auto-restrict hostelFilter if admin is limited to specific hostels
        const allowed =
          !adminProfile?.hostels?.length || adminProfile?.isSuperAdmin
            ? all
            : all.filter((h) => adminProfile?.hostels?.includes(h.id) ?? false);
        if (allowed.length === 1) {
          setHostelFilter(allowed[0].name);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch recipient list whenever group or hostel filter changes (non-specific)
  useEffect(() => {
    if (recipientGroup === "specific") {
      setLoadedRecipients([]);
      setSelectedEmails(new Set());
      return;
    }

    // Cancel any in-flight request
    if (loadAbortRef.current) loadAbortRef.current.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoadingRecipients(true);
    setRecipientLoadError("");
    setLoadedRecipients([]);
    setSelectedEmails(new Set());

    const params = new URLSearchParams({ group: recipientGroup });
    if (hostelFilter) params.set("hostel", hostelFilter);

    apiFetch(`/api/admin/get-email-recipients?${params}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const list: Recipient[] = data.recipients ?? [];
        setLoadedRecipients(list);
        setSelectedEmails(new Set(list.map((r) => r.email)));
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setRecipientLoadError(err.message || "Failed to load recipients");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRecipients(false);
      });

    return () => controller.abort();
  }, [recipientGroup, hostelFilter]);

  const toggleAll = () => {
    if (selectedEmails.size === loadedRecipients.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(loadedRecipients.map((r) => r.email)));
    }
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const removeRecipient = (email: string) => {
    setLoadedRecipients((prev) => prev.filter((r) => r.email !== email));
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
  };

  const removeSelected = () => {
    setLoadedRecipients((prev) =>
      prev.filter((r) => !selectedEmails.has(r.email)),
    );
    setSelectedEmails(new Set());
  };

  const addSpecificEmail = () => {
    const email = specificInput.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (!specificEmails.includes(email)) {
      setSpecificEmails((prev) => [...prev, email]);
    }
    setSpecificInput("");
  };

  const removeSpecificEmail = (email: string) => {
    setSpecificEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleSend = async () => {
    if (!subject.trim()) {
      alert("Please enter a subject.");
      return;
    }
    const strippedHtml = html.replace(/<[^>]*>/g, "").trim();
    if (!strippedHtml) {
      alert("Please write a message.");
      return;
    }
    if (recipientGroup === "specific" && specificEmails.length === 0) {
      alert("Please add at least one recipient email.");
      return;
    }
    if (recipientGroup !== "specific" && selectedEmails.size === 0) {
      alert("No recipients selected. Please select at least one recipient.");
      return;
    }

    setSending(true);
    setResult(null);

    // For non-specific groups, send only the admin-selected subset
    const finalEmails =
      recipientGroup === "specific"
        ? specificEmails
        : Array.from(selectedEmails);

    try {
      const res = await apiFetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          html,
          recipientGroup: "specific",
          specificEmails: finalEmails,
          senderName: adminProfile?.isSuperAdmin
            ? undefined
            : adminProfile?.username || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send emails");
      setResult({ success: true, ...data });
      setShowSaveDraftPrompt(true);
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  const selected = RECIPIENT_OPTIONS.find((o) => o.id === recipientGroup)!;

  return (
    <ProtectedRoute module='emails'>
      <div className='min-h-screen bg-apple-gray-50'>
        {/* Header */}
        <header className='bg-white shadow-sm sticky top-0 z-10'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-3'>
                <button
                  onClick={() => router.push("/admin/dashboard")}
                  className='p-2 hover:bg-apple-gray-100 rounded-lg transition-colors'>
                  <ArrowLeft className='w-5 h-5 text-apple-gray-600' />
                </button>
                <Logo variant='dark' />
                <div>
                  <h1 className='text-2xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-black-400 bg-clip-text text-transparent'>
                    Email Management
                  </h1>
                  <p className='text-sm text-apple-gray-600'>
                    Send newsletters and announcements to users
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className='flex items-center gap-2 px-4 py-2 text-sm font-medium text-apple-gray-700 hover:bg-apple-gray-100 rounded-lg transition-colors'>
                <LogOut className='w-4 h-4' />
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6'>
          {/* Send Result */}
          {result && (
            <div
              className={`rounded-2xl p-5 flex items-start gap-4 ${
                result.success
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}>
              {result.success ? (
                <>
                  <CheckCircle className='w-6 h-6 text-green-600 flex-shrink-0 mt-0.5' />
                  <div>
                    <p className='font-semibold text-green-900'>
                      Emails sent successfully!
                    </p>
                    <p className='text-sm text-green-700 mt-1'>
                      Sent {result.sent} of {result.total} emails.
                      {(result.failed ?? 0) > 0 && (
                        <span className='text-amber-700'>
                          {" "}
                          ({result.failed} failed)
                        </span>
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className='w-6 h-6 text-red-600 flex-shrink-0 mt-0.5' />
                  <div>
                    <p className='font-semibold text-red-900'>Failed to send</p>
                    <p className='text-sm text-red-700 mt-1'>{result.error}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Recipients Section */}
          <div className='bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-6'>
            <h2 className='text-lg font-semibold text-apple-gray-900 mb-4'>
              Recipients
            </h2>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5'>
              {RECIPIENT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type='button'
                  onClick={() => {
                    setRecipientGroup(option.id);
                    setResult(null);
                  }}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    recipientGroup === option.id
                      ? "border-blue-400 bg-blue-50"
                      : "border-apple-gray-200 hover:border-blue-200 bg-white"
                  }`}>
                  <div
                    className={`p-2 bg-gradient-to-r ${option.color} rounded-lg flex-shrink-0`}>
                    <div className='text-white'>{option.icon}</div>
                  </div>
                  <div>
                    <p
                      className={`font-semibold text-sm ${
                        recipientGroup === option.id
                          ? "text-blue-900"
                          : "text-apple-gray-900"
                      }`}>
                      {option.label}
                    </p>
                    <p className='text-xs text-apple-gray-500 mt-0.5'>
                      {option.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Hostel Filter (for all / tv-users / data-users) */}
            {recipientGroup !== "specific" && (
              <div>
                <label className='block text-sm font-medium text-apple-gray-700 mb-2'>
                  Filter by Hostel{" "}
                  <span className='text-apple-gray-400 font-normal'>
                    (optional — leave blank for all hostels)
                  </span>
                </label>
                <div className='relative'>
                  <Building2 className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400 pointer-events-none' />
                  <select
                    value={hostelFilter}
                    onChange={(e) => setHostelFilter(e.target.value)}
                    className='w-full pl-10 pr-10 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-400 focus:outline-none appearance-none bg-white text-apple-gray-900 text-sm'>
                    {(!adminProfile?.hostels?.length ||
                      adminProfile?.isSuperAdmin) && (
                      <option value=''>All hostels</option>
                    )}
                    {allowedHostels.map((h) => (
                      <option key={h.id} value={h.name}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className='absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400 pointer-events-none' />
                </div>
              </div>
            )}

            {/* Recipient Preview List (for all / tv-users / data-users) */}
            {recipientGroup !== "specific" && (
              <div className='mt-5'>
                {loadingRecipients ? (
                  <div className='flex items-center gap-3 py-6 justify-center text-apple-gray-500'>
                    <Loader2 className='w-5 h-5 animate-spin' />
                    <span className='text-sm'>Loading recipients…</span>
                  </div>
                ) : recipientLoadError ? (
                  <div className='flex items-center gap-2 py-4 text-red-600 text-sm'>
                    <AlertCircle className='w-4 h-4 flex-shrink-0' />
                    {recipientLoadError}
                  </div>
                ) : loadedRecipients.length === 0 ? (
                  <p className='text-sm text-apple-gray-500 py-4 text-center'>
                    No recipients found for this selection.
                  </p>
                ) : (
                  <div className='border-2 border-apple-gray-200 rounded-xl overflow-hidden'>
                    {/* List Header */}
                    <div className='flex items-center justify-between px-4 py-3 bg-apple-gray-50 border-b border-apple-gray-200'>
                      <div className='flex items-center gap-2'>
                        <UserCheck className='w-4 h-4 text-blue-500' />
                        <span className='text-sm font-semibold text-apple-gray-900'>
                          {selectedEmails.size} of {loadedRecipients.length}{" "}
                          recipients selected
                        </span>
                      </div>
                      <div className='flex items-center gap-3'>
                        {selectedEmails.size > 0 && (
                          <button
                            type='button'
                            onClick={removeSelected}
                            className='inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 transition-colors'>
                            <Trash2 className='w-3 h-3' />
                            Remove Selected
                          </button>
                        )}
                        <button
                          type='button'
                          onClick={toggleAll}
                          className='text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors'>
                          {selectedEmails.size === loadedRecipients.length
                            ? "Deselect All"
                            : "Select All"}
                        </button>
                      </div>
                    </div>
                    {/* Scrollable List */}
                    <div className='max-h-64 overflow-y-auto divide-y divide-apple-gray-100'>
                      {loadedRecipients.map((r) => (
                        <div
                          key={r.email}
                          className='flex items-center gap-3 px-4 py-3 hover:bg-apple-gray-50 transition-colors group'>
                          <label className='flex items-center gap-3 flex-1 min-w-0 cursor-pointer'>
                            <input
                              type='checkbox'
                              checked={selectedEmails.has(r.email)}
                              onChange={() => toggleEmail(r.email)}
                              className='w-4 h-4 rounded accent-blue-500 cursor-pointer flex-shrink-0'
                            />
                            <div className='min-w-0'>
                              {r.name && (
                                <p className='text-sm font-medium text-apple-gray-900 truncate'>
                                  {r.name}
                                </p>
                              )}
                              <p
                                className={`text-xs truncate ${
                                  r.name
                                    ? "text-apple-gray-500"
                                    : "text-apple-gray-900 text-sm font-medium"
                                }`}>
                                {r.email}
                              </p>
                            </div>
                          </label>
                          <button
                            type='button'
                            onClick={() => removeRecipient(r.email)}
                            className='opacity-0 group-hover:opacity-100 p-1 text-apple-gray-400 hover:text-red-500 transition-all flex-shrink-0'
                            title='Remove from list'>
                            <X className='w-3.5 h-3.5' />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Specific Emails Input */}
            {recipientGroup === "specific" && (
              <div>
                <label className='block text-sm font-medium text-apple-gray-700 mb-2'>
                  Add Email Addresses
                </label>
                <div className='flex gap-2'>
                  <input
                    type='email'
                    value={specificInput}
                    onChange={(e) => setSpecificInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSpecificEmail();
                      }
                    }}
                    placeholder='user@example.com'
                    className='flex-1 px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-400 focus:outline-none text-sm'
                  />
                  <button
                    type='button'
                    onClick={addSpecificEmail}
                    className='px-5 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity'>
                    Add
                  </button>
                </div>
                {specificEmails.length > 0 && (
                  <div className='flex flex-wrap gap-2 mt-3'>
                    {specificEmails.map((email) => (
                      <span
                        key={email}
                        className='inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium'>
                        {email}
                        <button
                          type='button'
                          onClick={() => removeSpecificEmail(email)}
                          className='text-blue-500 hover:text-blue-700 transition-colors'>
                          <X className='w-3 h-3' />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Templates */}
          <div className='bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-6'>
            <h2 className='text-lg font-semibold text-apple-gray-900 mb-4 flex items-center gap-2'>
              <FileText className='w-5 h-5 text-blue-500' />
              Quick Templates
            </h2>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2'>
              {EMAIL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type='button'
                  onClick={() => loadTemplate(tpl)}
                  className='px-3 py-2.5 text-sm font-medium text-apple-gray-700 bg-apple-gray-50 border border-apple-gray-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all text-center'>
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Drafts */}
          <div className='bg-white rounded-2xl shadow-sm border border-apple-gray-200 overflow-hidden'>
            <button
              type='button'
              onClick={() => setShowDrafts((v) => !v)}
              className='w-full flex items-center justify-between px-6 py-4 hover:bg-apple-gray-50 transition-colors'>
              <h2 className='text-lg font-semibold text-apple-gray-900 flex items-center gap-2'>
                <BookOpen className='w-5 h-5 text-purple-500' />
                Saved Drafts
                {drafts.length > 0 && (
                  <span className='text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full'>
                    {drafts.length}
                  </span>
                )}
              </h2>
              <ChevronRight
                className={`w-5 h-5 text-apple-gray-400 transition-transform ${
                  showDrafts ? "rotate-90" : ""
                }`}
              />
            </button>
            {showDrafts && (
              <div className='border-t border-apple-gray-200 px-6 py-4'>
                {loadingDrafts ? (
                  <div className='flex items-center gap-2 py-4 justify-center text-apple-gray-500'>
                    <Loader2 className='w-4 h-4 animate-spin' />
                    <span className='text-sm'>Loading drafts…</span>
                  </div>
                ) : drafts.length === 0 ? (
                  <p className='text-sm text-apple-gray-500 py-4 text-center'>
                    No saved drafts yet. Save one after composing a message.
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className='flex items-center gap-3 p-3 rounded-xl border border-apple-gray-200 hover:border-blue-200 hover:bg-blue-50/50 transition-all group'>
                        <button
                          type='button'
                          onClick={() => loadDraft(draft)}
                          className='flex-1 min-w-0 text-left'>
                          <p className='text-sm font-medium text-apple-gray-900 truncate'>
                            {draft.subject}
                          </p>
                          <p className='text-xs text-apple-gray-500 mt-0.5'>
                            {new Date(draft.updatedAt).toLocaleDateString()} ·{" "}
                            {new Date(draft.updatedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </button>
                        <button
                          type='button'
                          onClick={() => deleteDraft(draft.id)}
                          className='opacity-0 group-hover:opacity-100 p-1.5 text-apple-gray-400 hover:text-red-500 transition-all flex-shrink-0'
                          title='Delete draft'>
                          <Trash2 className='w-4 h-4' />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Compose Section */}
          <div className='bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-6'>
            <h2 className='text-lg font-semibold text-apple-gray-900 mb-4'>
              Compose Message
            </h2>

            {/* Subject */}
            <div className='mb-5'>
              <label className='block text-sm font-medium text-apple-gray-700 mb-2'>
                Subject
              </label>
              <input
                type='text'
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder='e.g. Important update about Lodge Internet'
                className='w-full px-4 py-3 rounded-xl border-2 border-apple-gray-200 focus:border-blue-400 focus:outline-none text-sm'
              />
            </div>

            {/* Body */}
            <div className='mb-5'>
              <label className='block text-sm font-medium text-apple-gray-700 mb-2'>
                Message Body
              </label>
              <RichEditor
                onChange={setHtml}
                contentKey={editorContentKey}
                initialContent={editorInitialContent}
              />
            </div>

            {/* Preview toggle */}
            {html && html !== "<p></p>" && (
              <div className='mb-5'>
                <button
                  type='button'
                  onClick={() => setShowPreview((v) => !v)}
                  className='inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors'>
                  {showPreview ? (
                    <>
                      <EyeOff className='w-4 h-4' />
                      Hide Preview
                    </>
                  ) : (
                    <>
                      <Eye className='w-4 h-4' />
                      Preview Email
                    </>
                  )}
                </button>

                {showPreview && (
                  <div className='mt-3 border-2 border-apple-gray-200 rounded-2xl overflow-hidden'>
                    <div className='bg-apple-gray-50 px-4 py-2 border-b border-apple-gray-200 text-xs font-medium text-apple-gray-500 uppercase tracking-wide'>
                      Email Preview
                    </div>
                    <div className='bg-[#f5f5f7] p-4'>
                      <iframe
                        srcDoc={buildPreviewHtml(html)}
                        title='Email preview'
                        className='w-full rounded-xl border-0 bg-white'
                        style={{ height: "500px" }}
                        sandbox='allow-same-origin'
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary & Send */}
            <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-apple-gray-200'>
              <div className='text-sm text-apple-gray-600'>
                Sending to:{" "}
                <span className='font-semibold text-apple-gray-900'>
                  {selected.label}
                </span>
                {hostelFilter && recipientGroup !== "specific" && (
                  <span className='text-apple-gray-500'> → {hostelFilter}</span>
                )}
                {recipientGroup !== "specific" && !loadingRecipients && (
                  <span className='text-apple-gray-500'>
                    {" "}
                    ({selectedEmails.size} recipient
                    {selectedEmails.size !== 1 ? "s" : ""})
                  </span>
                )}
                {recipientGroup === "specific" && specificEmails.length > 0 && (
                  <span className='text-apple-gray-500'>
                    {" "}
                    ({specificEmails.length} address
                    {specificEmails.length !== 1 ? "es" : ""})
                  </span>
                )}
              </div>

              {canEdit && (
                <div className='flex items-center gap-3'>
                  <button
                    type='button'
                    onClick={saveDraft}
                    disabled={savingDraft || !subject.trim()}
                    className='inline-flex items-center gap-2 px-5 py-3.5 border-2 border-apple-gray-200 text-apple-gray-700 font-semibold rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm'>
                    <Save className='w-4 h-4' />
                    {savingDraft ? "Saving…" : "Save Draft"}
                  </button>
                  <button
                    type='button'
                    onClick={handleSend}
                    disabled={sending}
                    className='inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl text-sm'>
                    <Send className='w-4 h-4' />
                    {sending ? "Sending…" : "Send Email"}
                  </button>
                </div>
              )}
            </div>

            {/* Save to drafts prompt after sending */}
            {showSaveDraftPrompt && (
              <div className='mt-5 p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-4'>
                <p className='text-sm text-purple-800 font-medium'>
                  Save this message as a draft for future use?
                </p>
                <div className='flex items-center gap-2 flex-shrink-0'>
                  <button
                    type='button'
                    onClick={() => {
                      saveDraft();
                    }}
                    disabled={savingDraft}
                    className='px-4 py-2 text-sm font-semibold bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50'>
                    {savingDraft ? "Saving…" : "Yes, Save"}
                  </button>
                  <button
                    type='button'
                    onClick={() => setShowSaveDraftPrompt(false)}
                    className='px-4 py-2 text-sm font-medium text-apple-gray-600 hover:text-apple-gray-800 transition-colors'>
                    No Thanks
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
