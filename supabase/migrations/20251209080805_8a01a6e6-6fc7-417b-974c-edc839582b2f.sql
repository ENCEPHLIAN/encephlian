-- Add storage policy to allow admins to upload files for any user
CREATE POLICY "Admins can upload EEG files for any user"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'eeg-uploads' 
  AND (
    has_role(auth.uid(), 'super_admin') 
    OR has_role(auth.uid(), 'ops') 
    OR has_role(auth.uid(), 'management')
  )
);

-- Add storage policy to allow admins to view all EEG uploads
CREATE POLICY "Admins can view all EEG uploads"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'eeg-uploads' 
  AND (
    has_role(auth.uid(), 'super_admin') 
    OR has_role(auth.uid(), 'ops') 
    OR has_role(auth.uid(), 'management')
  )
);