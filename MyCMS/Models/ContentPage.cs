using System;
using System.ComponentModel.DataAnnotations;

namespace MyCMS.Models
{
    public class ContentPage
    {
        public int Id { get; set; }

        [Required]
        [StringLength(100)]
        public string Title { get; set; }

        [Required]
        [RegularExpression(@"^[a-z0-9\-]+$", ErrorMessage = "Slug must contain only lowercase letters, numbers, and hyphens.")]
        [StringLength(100)]
        public string Slug { get; set; }

        [Required]
        [DataType(DataType.Html)]
        public string Content { get; set; }

        public DateTime CreatedAt { get; set; }

        public DateTime UpdatedAt { get; set; }

        public bool IsPublished { get; set; }
    }
}
