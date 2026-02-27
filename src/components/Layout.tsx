import React from 'react';
import { Link } from 'react-router-dom';
import { Home, LogIn, Share } from 'lucide-react';
import { useAuth } from '../store/auth';
import { UserMenu } from './UserMenu';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

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
    <div className="min-h-screen flex flex-col">
      <header className="bg-white shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2 text-[#C47756] hover:text-[#B5684A]">
            <Home className="h-6 w-6" />
            <span className="text-xl font-semibold">@surfhousebaja</span>
          </Link>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={handleShare}
              className="flex items-center space-x-1 text-gray-600 hover:text-gray-900"
            >
              <Share className="h-5 w-5" />
              <span className="hidden sm:inline">Share</span>
            </button>
            {user ? (
              <UserMenu />
            ) : (
              <Link
                to="/login"
                className="flex items-center space-x-1 text-gray-600 hover:text-gray-900"
              >
                <LogIn className="h-5 w-5" />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </nav>
      </header>

      <div className="bg-red-600 text-white py-3 px-4 text-center">
        <p className="text-base sm:text-lg font-medium">
          Book Direct, No Airbnb Fees, Chat with Host.
        </p>
      </div>

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-gray-50 border-t">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm">
            © {new Date().getFullYear()} @surfhousebaja. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}