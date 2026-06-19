import { Injectable } from '@nestjs/common';

import {
  CloneResult,
  RepoConnector,
  RepoCredentials,
  TreeEntry,
} from '../code-analyst/repo-connector';

const FAKE_CS_CONTENT = `
using System.Web.Mvc;

namespace MyCMS.Controllers
{
    public class HomeController : Controller
    {
        public ActionResult Index()
        {
            // Business rule: Only published pages are shown to guests
            if (!User.IsInRole("Admin"))
            {
                ViewBag.ShowDraftPages = false;
            }
            return View();
        }

        [Authorize(Roles = "Admin")]
        public ActionResult Admin()
        {
            return View();
        }
    }
}
`.trim();

const FAKE_MODEL_CONTENT = `
using System.ComponentModel.DataAnnotations;

namespace MyCMS.Models
{
    public class ContentPage
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Title { get; set; }

        [Required]
        public string Content { get; set; }

        public bool IsPublished { get; set; }
    }
}
`.trim();

@Injectable()
export class MockRepoConnector implements RepoConnector {
  private authed = false;

  async auth(_creds: RepoCredentials): Promise<void> {
    this.authed = true;
  }

  async listTree(_subPath?: string): Promise<TreeEntry[]> {
    return [
      { path: 'Controllers/HomeController.cs', type: 'file', size: FAKE_CS_CONTENT.length },
      { path: 'Models/ContentPage.cs', type: 'file', size: FAKE_MODEL_CONTENT.length },
    ];
  }

  async readFile(path: string): Promise<string> {
    if (path.includes('Controller')) return FAKE_CS_CONTENT;
    return FAKE_MODEL_CONTENT;
  }

  async clone(): Promise<CloneResult> {
    return {
      files: new Map([
        ['Controllers/HomeController.cs', FAKE_CS_CONTENT],
        ['Models/ContentPage.cs', FAKE_MODEL_CONTENT],
      ]),
    };
  }
}
