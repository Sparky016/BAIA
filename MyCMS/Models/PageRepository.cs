using System;
using System.Collections.Generic;
using System.Linq;

namespace MyCMS.Models
{
    public static class PageRepository
    {
        private static readonly List<ContentPage> _pages = new List<ContentPage>();
        private static readonly object _lock = new object();
        private static int _nextId = 1;

        static PageRepository()
        {
            // Seed sample data
            Add(new ContentPage
            {
                Title = "Home",
                Slug = "home",
                Content = @"<div class=""hero-section"">
    <h1>Welcome to MyCMS</h1>
    <p>A modern, lightweight content management system built on .NET Framework 4.8 MVC. Enjoy speed, flexibility, and absolute control over your digital experiences.</p>
    <a href=""/about"" class=""btn btn-primary"">Learn More About Us</a>
</div>
<div class=""features-grid"">
    <div class=""feature-card"">
        <div class=""feature-icon"">⚡</div>
        <h3>High Performance</h3>
        <p>Optimized compiled execution with the robust .NET Framework CLR pipeline for maximum stability.</p>
    </div>
    <div class=""feature-card"">
        <div class=""feature-icon"">🎨</div>
        <h3>Aesthetic Design</h3>
        <p>A curated dashboard and front-end interface utilizing clean CSS, HSL colors, and micro-interactions.</p>
    </div>
    <div class=""feature-card"">
        <div class=""feature-icon"">🛠️</div>
        <h3>Full Control</h3>
        <p>Create, edit, and publish custom pages instantly with clean SEO-friendly slug matching routing patterns.</p>
    </div>
</div>",
                IsPublished = true
            });

            Add(new ContentPage
            {
                Title = "About Us",
                Slug = "about",
                Content = @"<h2>About MyCMS</h2>
<p>MyCMS is a sample application designed to demonstrate the power of classic ASP.NET MVC 5 running on .NET Framework 4.8. It implements standard architecture models like routing, in-memory repository mockups, separation of concerns, and clean markup separation.</p>
<h3>Our Mission</h3>
<p>To provide developers with a beautiful starting point for building content management workflows without unnecessary configuration clutter.</p>",
                IsPublished = true
            });

            Add(new ContentPage
            {
                Title = "Services",
                Slug = "services",
                Content = @"<h2>Our Premium Offerings</h2>
<p>Explore what we can do to accelerate your business goals using modern engineering frameworks.</p>
<ul>
    <li><strong>Web Application Development:</strong> High-performance apps tailored to your scale.</li>
    <li><strong>Cloud Architecture Design:</strong> Resilient cloud systems leveraging best practices.</li>
    <li><strong>UI/UX Design Integration:</strong> Crafting visual systems that delight users.</li>
</ul>",
                IsPublished = true
            });
        }

        public static List<ContentPage> GetAll()
        {
            lock (_lock)
            {
                return _pages.OrderBy(p => p.Id).ToList();
            }
        }

        public static ContentPage GetById(int id)
        {
            lock (_lock)
            {
                return _pages.FirstOrDefault(p => p.Id == id);
            }
        }

        public static ContentPage GetBySlug(string slug)
        {
            lock (_lock)
            {
                return _pages.FirstOrDefault(p => string.Equals(p.Slug, slug, StringComparison.OrdinalIgnoreCase));
            }
        }

        public static void Add(ContentPage page)
        {
            lock (_lock)
            {
                page.Id = _nextId++;
                page.CreatedAt = DateTime.Now;
                page.UpdatedAt = DateTime.Now;
                _pages.Add(page);
            }
        }

        public static void Update(ContentPage page)
        {
            lock (_lock)
            {
                var existing = _pages.FirstOrDefault(p => p.Id == page.Id);
                if (existing != null)
                {
                    existing.Title = page.Title;
                    existing.Slug = page.Slug.ToLowerInvariant();
                    existing.Content = page.Content;
                    existing.IsPublished = page.IsPublished;
                    existing.UpdatedAt = DateTime.Now;
                }
            }
        }

        public static void Delete(int id)
        {
            lock (_lock)
            {
                var existing = _pages.FirstOrDefault(p => p.Id == id);
                if (existing != null)
                {
                    _pages.Remove(existing);
                }
            }
        }
    }
}
