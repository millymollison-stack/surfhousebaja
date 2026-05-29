/*
  # Add Storage Policies for Property Images

  1. Changes
    - Create storage bucket for property images
    - Add policies for image management
    - Enable public access to images
    - Restrict upload/delete to admin users

  2. Security
    - Public read access for all images
    - Admin-only write access
    - Secure file management
*/

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to view images
CREATE POLICY "Allow public access to images"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-images');

-- Allow admin users to upload images
CREATE POLICY "Allow admin users to upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'property-images'
  AND auth.role() = 'authenticated'
  AND (
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = auth.uid()
  )
);

-- Allow admin users to update images
CREATE POLICY "Allow admin users to update images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'property-images'
  AND auth.role() = 'authenticated'
  AND (
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = auth.uid()
  )
);

-- Allow admin users to delete images
CREATE POLICY "Allow admin users to delete images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'property-images'
  AND auth.role() = 'authenticated'
  AND (
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = auth.uid()
  )
);