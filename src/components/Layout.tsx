import React from 'react';
import { Link } from 'react-router-dom';
import { Home, LogIn, Share, User } from 'lucide-react';
import { useAuth } from '../store/auth';
import { UserMenu } from './UserMenu';

export function Layout({ children, isEditing, onToggleEdit, hasChanges, onSaveChanges }: { 
  children: React.ReactNode; 
  isEditing?: boolean; 
  onToggleEdit?: () => void;
  hasChanges?: boolean;
  onSaveChanges?: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: '@surfhousebaja',
          url: window.location.href,
        });
      } else {
        throw new Error('Share API not supported');
      }
    } catch (error) {
      // Fallback to clipboard copy
      try {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
      } catch (clipboardError) {
        console.error('Failed to copy to clipboard:', clipboardError);
        alert('Unable to share. Please copy the URL manually.');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <header className="absolute top-0 left-0 right-0 z-[9997] header-transparent">
        <nav className="max-w-7xl mx-auto px-4 sm:px-8 md:px-12 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2 text-white hover:text-white">
            <Home className="h-6 w-6 opacity-90" />
            <span className="text-lg font-medium">@surfhousebaja</span>
          </Link>
          
          <div className="flex items-center space-x-3">
            {isAdmin && (
              <>
                {hasChanges ? (
                  <button
                    onClick={() => {
                      onSaveChanges?.();
                    }}
                    className="px-3 py-1.5 rounded text-sm font-bold transition-all bg-green-600 hover:bg-green-700 text-white animate-pulse"
                  >
                    Save Now
                  </button>
                ) : isEditing ? (
                  <button
                    onClick={() => {
                      onToggleEdit?.();
                    }}
                    className="px-3 py-1.5 rounded text-sm font-bold transition-all bg-[#C47756] hover:bg-[#B5684A] text-white"
                  >
                    Save & Exit
                  </button>
                ) : (
                  <button
                    onClick={() => onToggleEdit?.()}
                    className="px-3 py-1.5 rounded text-sm font-medium transition-all bg-red-600 hover:bg-red-700 text-white"
                  >
                    Edit Mode
                  </button>
                )}
              </>
            )}
            <button
              onClick={handleShare}
              className="flex items-center space-x-1 text-white/80 hover:text-white text-sm"
            >
              <Share className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
            {user ? (
              <UserMenu />
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/15 rounded text-white/90 hover:bg-white/30 hover:text-white text-sm transition-all"
              >
                Sign In
              </Link>
            )}
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-gray-50 border-t">
        {!(isEditing ?? false) && (
          <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white py-3 px-4 text-center z-40">
            <p className="text-base sm:text-lg font-medium">
              Book Direct, No Airbnb Fees, Chat with Host.
            </p>
          </div>
        )}
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 footer-content ${isEditing ?? false ? '' : 'pt-3'}`} style={{ height: isEditing ?? false ? '40px' : '60px' }}>
          <p className="text-center text-gray-500 text-sm" style={{ paddingTop: '10px' }}>
            © {new Date().getFullYear()} @surfhousebaja. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}