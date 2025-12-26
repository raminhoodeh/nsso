-- Explicitly enable public read access for advanced profile tables

-- Experiences
DROP POLICY IF EXISTS "Experiences are viewable by everyone" ON public.experiences;
CREATE POLICY "Experiences are viewable by everyone" 
ON public.experiences FOR SELECT 
USING (true);

-- Qualifications
DROP POLICY IF EXISTS "Qualifications are viewable by everyone" ON public.qualifications;
CREATE POLICY "Qualifications are viewable by everyone" 
ON public.qualifications FOR SELECT 
USING (true);

-- Projects
DROP POLICY IF EXISTS "Projects are viewable by everyone" ON public.projects;
CREATE POLICY "Projects are viewable by everyone" 
ON public.projects FOR SELECT 
USING (true);

-- Products
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
CREATE POLICY "Products are viewable by everyone" 
ON public.products FOR SELECT 
USING (true);
