using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portal.Api.Dados.Migrations
{
    /// <inheritdoc />
    public partial class StatusCiDaPr : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "sha_ultimo_commit",
                table: "pull_requests",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "status_ci",
                table: "pull_requests",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "sem CI");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "sha_ultimo_commit",
                table: "pull_requests");

            migrationBuilder.DropColumn(
                name: "status_ci",
                table: "pull_requests");
        }
    }
}
