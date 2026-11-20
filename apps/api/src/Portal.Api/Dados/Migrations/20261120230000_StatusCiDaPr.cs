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
                name: "ShaUltimoCommit",
                table: "pull_requests",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StatusCi",
                table: "pull_requests",
                type: "text",
                nullable: false,
                defaultValue: "sem CI");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ShaUltimoCommit",
                table: "pull_requests");

            migrationBuilder.DropColumn(
                name: "StatusCi",
                table: "pull_requests");
        }
    }
}
