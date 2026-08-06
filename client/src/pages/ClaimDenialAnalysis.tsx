import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'wouter';
import { useCase } from '@/contexts/CaseContext';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

export default function ClaimDenialAnalysis() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCaseId, setCurrentCaseId } = useCase();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const numCaseId = caseId ? parseInt(caseId) : currentCaseId ?? 0;

  useEffect(() => {
    if (Number.isInteger(numCaseId) && numCaseId > 0 && numCaseId !== currentCaseId) {
      setCurrentCaseId(numCaseId);
    }
  }, [currentCaseId, numCaseId, setCurrentCaseId]);

  const { data: denials = [], isLoading } = trpc.analyze.getClaimDenialAnalysis.useQuery(
    { caseId: numCaseId },
    { enabled: numCaseId > 0 }
  );

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    denials.forEach((d: any) => {
      if (d.denial_category) cats.add(d.denial_category);
    });
    return Array.from(cats).sort();
  }, [denials]);

  // Filter denials
  const filteredDenials = useMemo(() => {
    return denials.filter((d: any) => {
      const matchesSearch =
        d.denial_reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.denial_category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.pattern_match?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !filterCategory || d.denial_category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [denials, searchTerm, filterCategory]);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'procedural': 'bg-blue-900 text-blue-100',
      'substantive': 'bg-purple-900 text-purple-100',
      'evidentiary': 'bg-orange-900 text-orange-100',
      'jurisdictional': 'bg-red-900 text-red-100',
      'temporal': 'bg-yellow-900 text-yellow-100',
      'factual': 'bg-green-900 text-green-100',
    };
    return colors[category?.toLowerCase()] || 'bg-gray-700 text-gray-100';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin text-3xl mb-2">⚖️</div>
          <p className="text-gray-400">Analyzing denial patterns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <span className="text-2xl">⚖️</span> Claim Denial Analysis
        </h1>
        <p className="text-gray-400 mt-2">
          Comprehensive analysis of claim denial patterns. Identifies the grounds for denial,
          supporting and contradicting evidence, and pattern matches against known denial templates.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Denials</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">{denials.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">{categories.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Filtered Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">{filteredDenials.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Pattern Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">
              {filteredDenials.filter((d: any) => d.pattern_match).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="space-y-4">
        <div className="relative">
          <Input
            placeholder="Search denial reasons..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-gray-900 border-gray-700 pl-10"
          />
          <span className="absolute left-3 top-2.5 text-gray-500">🔍</span>
        </div>

        {/* Category filters */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCategory(null)}
              className={`px-3 py-1 rounded text-sm transition ${
                filterCategory === null
                  ? 'bg-cyan-900 text-cyan-100 border border-cyan-700'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-600'
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                className={`px-3 py-1 rounded text-sm transition ${
                  filterCategory === cat
                    ? getCategoryColor(cat)
                    : 'bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="all">All Denials ({filteredDenials.length})</TabsTrigger>
          <TabsTrigger value="by-category">By Category ({categories.length})</TabsTrigger>
          <TabsTrigger value="pattern-matches">Pattern Matches ({filteredDenials.filter((d: any) => d.pattern_match).length})</TabsTrigger>
        </TabsList>

        {/* All Denials Tab */}
        <TabsContent value="all" className="space-y-3">
          {filteredDenials.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <span className="text-4xl">⚖️</span>
              <p className="mt-2">No denial patterns found matching your criteria.</p>
            </div>
          ) : (
            filteredDenials.map((denial: any, idx: number) => (
              <Card key={idx} className="bg-gray-900 border-gray-800 hover:border-gray-700 cursor-pointer transition">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-lg text-cyan-400">{denial.denial_reason}</CardTitle>
                      <CardDescription className="text-gray-400 mt-1">
                        {denial.denial_category}
                      </CardDescription>
                    </div>
                    <Badge className={getCategoryColor(denial.denial_category)}>
                      {denial.denial_category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Supporting Evidence */}
                  {denial.evidence_supporting && (
                    <div className="bg-gray-800 rounded p-3">
                      <h4 className="text-sm font-semibold text-green-400 mb-2">✓ Supporting Evidence</h4>
                      <p className="text-sm text-gray-300">{denial.evidence_supporting}</p>
                    </div>
                  )}

                  {/* Contradicting Evidence */}
                  {denial.evidence_contradicting && (
                    <div className="bg-gray-800 rounded p-3">
                      <h4 className="text-sm font-semibold text-red-400 mb-2">✗ Contradicting Evidence</h4>
                      <p className="text-sm text-gray-300">{denial.evidence_contradicting}</p>
                    </div>
                  )}

                  {/* Pattern Match */}
                  {denial.pattern_match && (
                    <div className="bg-purple-900 bg-opacity-30 border border-purple-700 rounded p-3">
                      <h4 className="text-sm font-semibold text-purple-300 mb-2">🔗 Pattern Match</h4>
                      <p className="text-sm text-gray-300">{denial.pattern_match}</p>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
                    Created: {denial.created_at ? new Date(denial.created_at).toLocaleDateString() : 'N/A'}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* By Category Tab */}
        <TabsContent value="by-category" className="space-y-4">
          {categories.map((category) => {
            const categoryDenials = filteredDenials.filter((d: any) => d.denial_category === category);
            return (
              <div key={category}>
                <h3 className="text-lg font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                  <Badge className={getCategoryColor(category)}>{category}</Badge>
                  <span className="text-gray-400 text-sm">({categoryDenials.length})</span>
                </h3>
                <div className="space-y-2 ml-4">
                  {categoryDenials.map((denial: any, idx: number) => (
                    <Card key={idx} className="bg-gray-800 border-gray-700">
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          <p className="font-medium text-cyan-300">{denial.denial_reason}</p>
                          {denial.evidence_supporting && (
                            <p className="text-xs text-green-400">✓ {denial.evidence_supporting.substring(0, 100)}...</p>
                          )}
                          {denial.pattern_match && (
                            <p className="text-xs text-purple-400">🔗 {denial.pattern_match.substring(0, 100)}...</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* Pattern Matches Tab */}
        <TabsContent value="pattern-matches" className="space-y-3">
          {filteredDenials.filter((d: any) => d.pattern_match).length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <span className="text-4xl">🔗</span>
              <p className="mt-2">No pattern matches found.</p>
            </div>
          ) : (
            filteredDenials
              .filter((d: any) => d.pattern_match)
              .map((denial: any, idx: number) => (
                <Card key={idx} className="bg-gray-900 border-purple-800 hover:border-purple-700 cursor-pointer transition">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-purple-400">{denial.denial_reason}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-purple-900 bg-opacity-30 border border-purple-700 rounded p-3">
                      <p className="text-sm text-gray-300">{denial.pattern_match}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-green-900 bg-opacity-20 rounded p-2">
                        <span className="text-green-400">Supporting:</span>
                        <p className="text-gray-300 mt-1">{denial.evidence_supporting?.substring(0, 50)}...</p>
                      </div>
                      <div className="bg-red-900 bg-opacity-20 rounded p-2">
                        <span className="text-red-400">Contradicting:</span>
                        <p className="text-gray-300 mt-1">{denial.evidence_contradicting?.substring(0, 50)}...</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
