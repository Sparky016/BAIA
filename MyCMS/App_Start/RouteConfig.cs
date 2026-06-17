using System.Web.Mvc;
using System.Web.Routing;

namespace MyCMS
{
    public class RouteConfig
    {
        public static void RegisterRoutes(RouteCollection routes)
        {
            routes.IgnoreRoute("{resource}.axd/{*pathInfo}");

            // Admin Routes
            routes.MapRoute(
                name: "Admin",
                url: "Admin/{action}/{id}",
                defaults: new { controller = "Admin", action = "Index", id = UrlParameter.Optional }
            );

            // Public Page Route (by slug)
            routes.MapRoute(
                name: "PublicPage",
                url: "{slug}",
                defaults: new { controller = "Home", action = "Page", slug = "home" }
            );

            // Default fallback
            routes.MapRoute(
                name: "Default",
                url: "{controller}/{action}/{id}",
                defaults: new { controller = "Home", action = "Index", id = UrlParameter.Optional }
            );
        }
    }
}
