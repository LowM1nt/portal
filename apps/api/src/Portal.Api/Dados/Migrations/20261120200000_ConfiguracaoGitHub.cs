using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portal.Api.Dados.Migrations
{
    /// <inheritdoc />
    public partial class ConfiguracaoGitHub : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "configuracoes_github",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_criptografado = table.Column<string>(type: "text", nullable: false),
                    final_token = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    repositorios = table.Column<string[]>(type: "text[]", nullable: false),
                    configurado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ultima_sincronizacao = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ultimo_erro = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_configuracoes_github", x => x.id);
                    table.ForeignKey(
                        name: "FK_configuracoes_github_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_configuracoes_github_workspace_id",
                table: "configuracoes_github",
                column: "workspace_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "configuracoes_github");
        }
    }
}
