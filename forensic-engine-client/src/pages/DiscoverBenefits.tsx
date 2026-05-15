import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Lightbulb,
  Share2,
  Copy,
  ChevronRight,
  ExternalLink,
  Phone,
  Heart,
  Sparkles,
  RefreshCw,
  Search,
} from "lucide-react";

export default function DiscoverBenefits() {

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedSpotlight, setExpandedSpotlight] = useState<string | null>(null);

  // Fetch daily spotlight
  const { data: dailyFeed, isLoading: dailyLoading } = trpc.discovery.daily.useQuery();

  // Fetch all categories
  const { data: categories } = trpc.discovery.categories.useQuery();

  // Fetch category spotlight when selected
  const { data: categoryFeed } = trpc.discovery.byCategory.useQuery(
    { category: selectedCategory! },
    { enabled: !!selectedCategory }
  );

  // Fetch all spotlights for browsing
  const { data: allSpotlights } = trpc.discovery.all.useQuery();

  // Filter spotlights by category
  const filteredSpotlights = selectedCategory
    ? allSpotlights?.filter((s: any) => s.category === selectedCategory)
    : allSpotlights;

  const handleShare = async (programId: string, headline: string) => {
    const shareText = `Did you know? ${headline}\n\n— Shared via Luminari Benefits Navigator`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Did You Know?",
          text: shareText,
        });
      } catch {
        // User cancelled or share failed, fall back to clipboard
        await copyToClipboard(shareText);
      }
    } else {
      await copyToClipboard(shareText);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard", {
        description: "Share this with someone who might need it.",
      });
    } catch {
      toast.error("Couldn't copy", {
        description: "Try selecting and copying the text manually.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-5xl py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </Link>
            <div className="h-5 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <h1 className="text-lg font-semibold text-white">Did You Know?</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/benefits">
              <Button variant="outline" size="sm" className="text-slate-300 border-white/10 hover:bg-white/5">
                <Search className="w-4 h-4 mr-1" />
                Search Benefits
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl py-8 space-y-10">
        {/* Daily Spotlight — The Hero */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-medium text-amber-400 uppercase tracking-wider">Today's Spotlight</h2>
          </div>

          {dailyLoading ? (
            <Card className="bg-gradient-to-br from-amber-950/40 to-slate-900 border-amber-500/20">
              <CardContent className="p-8">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-white/10 rounded w-3/4" />
                  <div className="h-4 bg-white/10 rounded w-full" />
                  <div className="h-4 bg-white/10 rounded w-5/6" />
                </div>
              </CardContent>
            </Card>
          ) : dailyFeed ? (
            <Card className="bg-gradient-to-br from-amber-950/40 to-slate-900 border-amber-500/20 overflow-hidden">
              <CardContent className="p-0">
                <div className="p-8 pb-6">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl flex-shrink-0">{dailyFeed.spotlight.icon}</div>
                    <div className="flex-1 min-w-0">
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 mb-3">
                        Did You Know?
                      </Badge>
                      <h3 className="text-xl md:text-2xl font-bold text-white mb-3 leading-tight">
                        {dailyFeed.spotlight.headline}
                      </h3>
                      <p className="text-slate-300 text-base leading-relaxed mb-4">
                        {dailyFeed.spotlight.explanation}
                      </p>

                      {dailyFeed.spotlight.common_misconception && (
                        <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
                          <p className="text-sm text-slate-400">
                            <span className="text-amber-400 font-medium">Common misconception: </span>
                            {dailyFeed.spotlight.common_misconception}
                          </p>
                        </div>
                      )}

                      <div className="bg-emerald-950/30 rounded-lg p-4 border border-emerald-500/20">
                        <p className="text-sm font-medium text-emerald-400 mb-1">What to do right now:</p>
                        <p className="text-sm text-slate-300">{dailyFeed.spotlight.action_step}</p>
                        {dailyFeed.spotlight.action_contact && (
                          <div className="mt-2 flex items-center gap-2">
                            {dailyFeed.spotlight.action_contact.startsWith("http") ? (
                              <a
                                href={dailyFeed.spotlight.action_contact}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Visit website
                              </a>
                            ) : (
                              <a
                                href={`tel:${dailyFeed.spotlight.action_contact.replace(/[^0-9+]/g, "")}`}
                                className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 underline"
                              >
                                <Phone className="w-3 h-3" />
                                {dailyFeed.spotlight.action_contact}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Share bar */}
                <div className="border-t border-white/10 px-8 py-3 bg-white/[0.02] flex items-center justify-between">
                  <p className="text-xs text-slate-500">Know someone who could use this?</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:text-amber-400"
                    onClick={() => handleShare(dailyFeed.spotlight.program_id, dailyFeed.spotlight.headline)}
                  >
                    <Share2 className="w-4 h-4 mr-1" />
                    Share This
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>

        {/* Category Grid */}
        <section>
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Browse by Category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`rounded-xl p-3 text-center transition-all border ${
                !selectedCategory
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/[0.03] border-white/5 text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="text-2xl mb-1">✨</div>
              <div className="text-xs font-medium">All</div>
              <div className="text-[10px] text-slate-500">{allSpotlights?.length || 0}</div>
            </button>
            {categories?.map((cat: any) => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category === selectedCategory ? null : cat.category)}
                className={`rounded-xl p-3 text-center transition-all border ${
                  selectedCategory === cat.category
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-white/[0.03] border-white/5 text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="text-2xl mb-1">{cat.icon}</div>
                <div className="text-xs font-medium truncate">{cat.label}</div>
                <div className="text-[10px] text-slate-500">{cat.count} facts</div>
              </button>
            ))}
          </div>
        </section>

        {/* Spotlight Cards */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
              {selectedCategory
                ? `${categories?.find((c: any) => c.category === selectedCategory)?.label || "Category"} Programs`
                : "All Programs"}
            </h2>
            <span className="text-xs text-slate-500">{filteredSpotlights?.length || 0} programs</span>
          </div>

          <div className="space-y-4">
            {filteredSpotlights?.map((spotlight: any) => {
              const isExpanded = expandedSpotlight === spotlight.program_id;
              return (
                <Card
                  key={spotlight.program_id}
                  className="bg-slate-900/50 border-white/5 hover:border-white/10 transition-all overflow-hidden"
                >
                  <CardContent className="p-0">
                    {/* Collapsed view */}
                    <button
                      onClick={() => setExpandedSpotlight(isExpanded ? null : spotlight.program_id)}
                      className="w-full text-left p-5 flex items-start gap-4"
                    >
                      <div className="text-2xl flex-shrink-0 mt-0.5">{spotlight.icon}</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-white mb-1 leading-snug">
                          {spotlight.headline}
                        </h3>
                        {!isExpanded && (
                          <p className="text-sm text-slate-400 line-clamp-2">{spotlight.explanation}</p>
                        )}
                      </div>
                      <ChevronRight
                        className={`w-5 h-5 text-slate-500 flex-shrink-0 mt-1 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {/* Expanded view */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-0 ml-12">
                        <p className="text-sm text-slate-300 leading-relaxed mb-4">
                          {spotlight.explanation}
                        </p>

                        {spotlight.common_misconception && (
                          <div className="bg-white/5 rounded-lg p-3 mb-4 border border-white/10">
                            <p className="text-xs text-slate-400">
                              <span className="text-amber-400 font-medium">Common misconception: </span>
                              {spotlight.common_misconception}
                            </p>
                          </div>
                        )}

                        <div className="bg-emerald-950/30 rounded-lg p-3 mb-4 border border-emerald-500/20">
                          <p className="text-xs font-medium text-emerald-400 mb-1">What to do right now:</p>
                          <p className="text-xs text-slate-300">{spotlight.action_step}</p>
                          {spotlight.action_contact && (
                            <div className="mt-2">
                              {spotlight.action_contact.startsWith("http") ? (
                                <a
                                  href={spotlight.action_contact}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Visit website
                                </a>
                              ) : (
                                <a
                                  href={`tel:${spotlight.action_contact.replace(/[^0-9+]/g, "")}`}
                                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 underline"
                                >
                                  <Phone className="w-3 h-3" />
                                  {spotlight.action_contact}
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-amber-400 h-8 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShare(spotlight.program_id, spotlight.headline);
                            }}
                          >
                            <Share2 className="w-3 h-3 mr-1" />
                            Share
                          </Button>
                          <Link href={`/benefits?search=${encodeURIComponent(spotlight.program_id)}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-400 hover:text-emerald-400 h-8 text-xs"
                            >
                              <Search className="w-3 h-3 mr-1" />
                              Full Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="text-center py-8">
          <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-8">
            <Heart className="w-8 h-8 text-rose-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Know someone who needs help?</h3>
            <p className="text-sm text-slate-400 mb-4 max-w-md mx-auto">
              Share any of these programs with someone who might benefit. Sometimes the biggest barrier
              is just not knowing the help exists.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/benefits">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Search className="w-4 h-4 mr-2" />
                  Find Benefits for Your Situation
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
