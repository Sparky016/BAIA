using System.Web.Mvc;
using MyCMS.Models;

namespace MyCMS.Controllers
{
    public class AdminController : Controller
    {
        // GET: Admin
        public ActionResult Index()
        {
            var pages = PageRepository.GetAll();
            return View(pages);
        }

        // GET: Admin/Create
        public ActionResult Create()
        {
            return View(new ContentPage { IsPublished = true });
        }

        // POST: Admin/Create
        [HttpPost]
        [ValidateInput(false)] // Allow HTML content input for CMS editing
        [ValidateAntiForgeryToken]
        public ActionResult Create(ContentPage page)
        {
            if (ModelState.IsValid)
            {
                // Validate duplicate slug
                var existing = PageRepository.GetBySlug(page.Slug);
                if (existing != null)
                {
                    ModelState.AddModelError("Slug", "A page with this slug already exists.");
                    return View(page);
                }

                PageRepository.Add(page);
                return RedirectToAction("Index");
            }
            return View(page);
        }

        // GET: Admin/Edit/5
        public ActionResult Edit(int id)
        {
            var page = PageRepository.GetById(id);
            if (page == null)
            {
                return HttpNotFound();
            }
            return View(page);
        }

        // POST: Admin/Edit/5
        [HttpPost]
        [ValidateInput(false)] // Allow HTML content input
        [ValidateAntiForgeryToken]
        public ActionResult Edit(ContentPage page)
        {
            if (ModelState.IsValid)
            {
                // Validate duplicate slug for other pages
                var existing = PageRepository.GetBySlug(page.Slug);
                if (existing != null && existing.Id != page.Id)
                {
                    ModelState.AddModelError("Slug", "A page with this slug already exists.");
                    return View(page);
                }

                PageRepository.Update(page);
                return RedirectToAction("Index");
            }
            return View(page);
        }

        // POST: Admin/Delete/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public ActionResult Delete(int id)
        {
            PageRepository.Delete(id);
            return RedirectToAction("Index");
        }
    }
}
