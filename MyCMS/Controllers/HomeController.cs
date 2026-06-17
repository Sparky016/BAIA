using System.Web.Mvc;
using MyCMS.Models;

namespace MyCMS.Controllers
{
    public class HomeController : Controller
    {
        public ActionResult Index()
        {
            var homePage = PageRepository.GetBySlug("home");
            if (homePage == null || !homePage.IsPublished)
            {
                return HttpNotFound("Home page not found or is unpublished.");
            }
            return View("Page", homePage);
        }

        public ActionResult Page(string slug)
        {
            if (string.IsNullOrEmpty(slug))
            {
                slug = "home";
            }

            var page = PageRepository.GetBySlug(slug);
            if (page == null || !page.IsPublished)
            {
                return HttpNotFound($"Page '{slug}' not found or is unpublished.");
            }

            return View(page);
        }
    }
}
