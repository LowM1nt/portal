using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portal.Api.Dados.Migrations
{
    /// <inheritdoc />
    public partial class MembrosEConvites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "email",
                table: "workspace_membros",
                type: "character varying(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "convites",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    papel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    token_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    criado_por = table.Column<Guid>(type: "uuid", nullable: false),
                    criado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expira_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    usado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    usado_por = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_convites", x => x.id);
                    table.ForeignKey(
                        name: "FK_convites_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_convites_token_hash",
                table: "convites",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_convites_workspace_id_usado_em_expira_em",
                table: "convites",
                columns: new[] { "workspace_id", "usado_em", "expira_em" });
            // Mesma regra da auditoria de 20/11: tabela nova nasce com RLS ligado (bloqueia a API REST do Supabase).
            migrationBuilder.Sql("ALTER TABLE convites ENABLE ROW LEVEL SECURITY;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "convites");

            migrationBuilder.DropColumn(
                name: "email",
                table: "workspace_membros");
        }
    }
}
