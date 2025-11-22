-- Enable RLS on report_templates table
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read templates
CREATE POLICY "Allow all users to read templates"
ON public.report_templates
FOR SELECT
TO authenticated
USING (true);

-- Create policy to allow only admins to manage templates (for future use)
CREATE POLICY "Allow admins to manage templates"
ON public.report_templates
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);