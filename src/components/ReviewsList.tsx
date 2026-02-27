import { useEffect, useState } from 'react';
import { Star, Trash2, ArrowUp, ArrowDown, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { Review } from '../types';
import { format } from 'date-fns';

export default function ReviewsList() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadReviews();
  }, [isAdmin]);

  const loadReviews = async () => {
    try {
      console.log('ReviewsList: Loading reviews...');
      let query = supabase.from('reviews').select('*');

      if (!isAdmin) {
        query = query.eq('is_verified', true);
      }

      const { data, error } = await query
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      console.log('ReviewsList: Query result:', { data, error });
      if (error) throw error;
      setReviews(data || []);
      console.log('ReviewsList: Set reviews:', data?.length || 0);
    } catch (error) {
      console.error('Error loading reviews:', error);
      setError('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };


  const handleDelete = async (reviewId: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;

    setActionLoading(reviewId);
    setError(null);
    try {
      const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', reviewId);

      if (error) throw error;
      await loadReviews();
    } catch (err) {
      console.error('Error deleting review:', err);
      setError('Failed to delete review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReorder = async (reviewId: string, direction: 'up' | 'down') => {
    setActionLoading(reviewId);
    setError(null);
    try {
      const currentIndex = reviews.findIndex(r => r.id === reviewId);
      if (currentIndex === -1) return;

      const currentReview = reviews[currentIndex];
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= reviews.length) return;

      const targetReview = reviews[targetIndex];

      const { error: error1 } = await supabase
        .from('reviews')
        .update({ display_order: targetReview.display_order })
        .eq('id', currentReview.id);

      const { error: error2 } = await supabase
        .from('reviews')
        .update({ display_order: currentReview.display_order })
        .eq('id', targetReview.id);

      if (error1 || error2) throw error1 || error2;
      await loadReviews();
    } catch (err) {
      console.error('Error reordering review:', err);
      setError('Failed to reorder review');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No reviews yet. Be the first to share your experience!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {reviews.map((review, index) => (
        <div
          key={review.id}
          className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h4 className="text-lg font-semibold text-gray-900">{review.guest_name}</h4>
              <p className="text-sm text-gray-500 mt-1">
                Stayed {format(new Date(review.stay_date), 'MMMM yyyy')}
              </p>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${
                    star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>

          <p className="text-gray-700 leading-relaxed mb-4">{review.review_text}</p>

          {isAdmin && (
            <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
              <button
                onClick={() => handleReorder(review.id, 'up')}
                disabled={actionLoading === review.id || index === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowUp className="w-4 h-4" />
                Move Up
              </button>

              <button
                onClick={() => handleReorder(review.id, 'down')}
                disabled={actionLoading === review.id || index === reviews.length - 1}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowDown className="w-4 h-4" />
                Move Down
              </button>

              <button
                onClick={() => handleDelete(review.id)}
                disabled={actionLoading === review.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
